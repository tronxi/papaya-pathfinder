import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT ||
    [join(homedir(), 'Library/Android/sdk'), join(homedir(), 'Android/Sdk')].find(existsSync);
if (!sdk) throw new Error('Instala Android SDK y define ANDROID_HOME para generar el APK.');
const newest = folder => readdirSync(folder).filter(name => /^\d+(\.\d+)*$/.test(name))
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }))[0];
const buildVersion = process.env.ANDROID_BUILD_TOOLS || newest(join(sdk, 'build-tools'));
const tools = join(sdk, 'build-tools', buildVersion);
const platform = join(sdk, 'platforms', 'android-35', 'android.jar');
if (!existsSync(platform)) throw new Error('Instala Android SDK Platform 35 con sdkmanager.');
if (!existsSync(join(root, 'dist/index.html'))) throw new Error('Ejecuta npm run build antes de empaquetar.');
const javaTool = name => process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', name) : name;
const sdkTool = name => join(tools, process.platform === 'win32' && ['d8', 'apksigner'].includes(name) ? `${name}.bat` : name);
function run(command, args) {
    const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Falló ${command} (${result.status})`);
}
function files(dir, suffix) {
    return readdirSync(dir, { withFileTypes: true }).flatMap(entry => entry.isDirectory()
        ? files(join(dir, entry.name), suffix) : entry.name.endsWith(suffix) ? [join(dir, entry.name)] : []);
}
const source = join(root, 'android/app/src/main');
const build = join(root, 'android/build');
const temp = join(build, 'apk');
rmSync(temp, { recursive: true, force: true });
for (const folder of ['generated', 'classes', 'dex']) mkdirSync(join(temp, folder), { recursive: true });
const artifacts = join(root, 'artifacts');
mkdirSync(artifacts, { recursive: true });
const apk = join(artifacts, 'papaya-pathfinder-debug.apk');
const unsigned = join(temp, 'unsigned.apk');
const aligned = join(temp, 'aligned.apk');
// The legacy GLB is not loaded by the game (the active rover is the FBX).
// Keep it in public/dist for the web project without adding 54 MB to the app.
const webAssets = join(temp, 'assets');
cpSync(join(root, 'dist'), webAssets, { recursive: true,
    filter: path => path !== join(root, 'dist', 'model.glb') });
console.log(`Empaquetando Android con Build Tools ${buildVersion}…`);
run(sdkTool('aapt2'), ['compile', '--dir', join(source, 'res'), '-o', join(temp, 'resources.zip')]);
run(sdkTool('aapt2'), ['link', '-o', unsigned, '--manifest', join(source, 'AndroidManifest.xml'),
    '-I', platform, '--java', join(temp, 'generated'), '-A', webAssets,
    '--version-code', '1', '--version-name', '1.0.0', join(temp, 'resources.zip')]);
run(javaTool('javac'), ['-source', '8', '-target', '8', '-Xlint:-options', '-bootclasspath', platform,
    '-d', join(temp, 'classes'), ...files(join(source, 'java'), '.java'), ...files(join(temp, 'generated'), '.java')]);
run(sdkTool('d8'), ['--lib', platform, '--min-api', '26', '--output', join(temp, 'dex'), ...files(join(temp, 'classes'), '.class')]);
run(javaTool('jar'), ['uf', unsigned, '-C', join(temp, 'dex'), 'classes.dex']);
run(sdkTool('zipalign'), ['-f', '-p', '4', unsigned, aligned]);
// A persistent local development key allows reinstalling subsequent APK builds.
// It is not a production signing key and stays outside version control.
const keystore = join(build, 'debug.keystore');
if (!existsSync(keystore)) run(javaTool('keytool'), ['-genkeypair', '-keystore', keystore,
    '-storepass', 'android', '-keypass', 'android', '-alias', 'androiddebugkey',
    '-dname', 'CN=Android Debug,O=Android,C=US', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000']);
run(sdkTool('apksigner'), ['sign', '--ks', keystore, '--ks-key-alias', 'androiddebugkey',
    '--ks-pass', 'pass:android', '--key-pass', 'pass:android', '--out', apk, aligned]);
run(sdkTool('apksigner'), ['verify', '--verbose', apk]);
run(sdkTool('zipalign'), ['-c', '4', apk]);
console.log(`\nAPK generado: ${apk}`);
