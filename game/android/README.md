# APK de Papaya Pathfinder

Generar una versión instalable de desarrollo:

```sh
npm run android:apk
```

El archivo se crea en `artifacts/papaya-pathfinder-debug.apk`. Incluye el juego y funciona sin servidor ni conexión. Arranca en horizontal, a pantalla completa, con controles táctiles. Requiere Android 8 o superior y WebView con WebGL 2.

Para compilar: Node, JDK 17 o superior, Android SDK Platform 35 y Android SDK Build Tools. El script detecta el SDK en las rutas habituales de macOS/Linux; también acepta `ANDROID_HOME` o `ANDROID_SDK_ROOT`, `JAVA_HOME` y `ANDROID_BUILD_TOOLS`.

El empaquetado utiliza directamente AAPT2, javac, D8, zipalign y apksigner del SDK, sin dependencias nativas adicionales. Los archivos nativos están en `android/app/src/main`. El GLB antiguo, que el juego no utiliza, se excluye del APK; el rover FBX sí se incluye.

La clave de desarrollo se conserva en `android/build/debug.keystore`, excluida de Git, para poder instalar nuevas compilaciones encima de las anteriores conservando el progreso. El APK no es una versión de publicación para Google Play.

Validación automática del empaquetado: compilación Java/DEX, firma del APK y alineación. Esto no sustituye la comprobación del juego en un dispositivo Android.

Referencias: [AAPT2](https://developer.android.com/tools/aapt2), [contenido local en WebView](https://developer.android.com/develop/ui/views/layout/webapps/load-local-content), [firma de APK](https://developer.android.com/tools/apksigner).
