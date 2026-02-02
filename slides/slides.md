---
marp: true
lang: es
title: "Papaya Pathfinder: rover 3D open-source inspirado en exploración planetaria"
description: "Sergio García Sánchez"
paginate: true
size: 16:9
theme: default
class: lead
style: |
  :root { --accent: #2563eb; }
  section.lead h1, section.lead h2 { color: var(--accent); }
  section { font-size: 30px; }
  footer { color: #666; font-size: 18px; }

  .title-wrap {
    max-width: 1200px;
    margin: 0 auto;
    text-align: center;
    padding-top: 12px;
  }
  .title-wrap h1 {
    font-size: 60px;
    line-height: 1.12;
    margin: 0 0 18px 0;
    color: var(--accent);
  }
  .title-wrap .meta {
    font-size: 30px;
    line-height: 1.35;
    color: #111;
    margin: 0 0 14px 0;
  }
  .title-wrap .director {
    font-size: 26px;
    color: #333;
    margin: 0;
  }
  .title-wrap .accent {
    width: 88px;
    height: 6px;
    background: var(--accent);
    border-radius: 3px;
    margin: 20px auto 16px;
  }
  .ucm-center {
    display: block;
    margin: 18px auto 0;
    height: 92px;
    object-fit: contain;
    opacity: 0.95;
  }

  /* Utilidades opcionales */
  .muted { color:#555; }
  .two-cols { display:grid; grid-template-columns: 1fr 1fr; gap: 22px; align-items:start; }
  .img-center { display:block; margin: 0 auto; max-height: 520px; width:auto; object-fit: contain; }
header: ""
---

<!-- _class: lead -->
<div class="title-wrap">
  <h1>Papaya Pathfinder: diseño y construcción de un rover 3D open-source</h1>
  <p class="meta"><strong>Sergio García Sánchez</strong></p>
  <div class="accent"></div>
</div>


---

## Índice

1. **Introducción**
2. **Inspiración: rovers de exploración**
3. **Ecosistema open-source**
4. **Objetivos de Papaya Pathfinder**
5. **Sistemas de control**
6. **Papaya Pathfinder Mini**
7. **Papaya Pathfinder**
8. **Futuros pasos**
---

## 1. Introducción


Papaya Pathfinder es un **rover terrestre impreso en 3D**, inspirado en los **rovers reales de exploración de Marte**.

Se plantea como una **plataforma open-source y reproducible** para integrar mecánica, electrónica, software y comunicaciones.


---

## 2. Inspiración: rovers de exploración

<img src="./figuras/rovers.webp" alt="rovers" height="500" width="1000">


---


<style>
.row { display: flex; gap: 24px; align-items: flex-start; }
.row .text { flex: 1; }
.row img { width: 38%; max-width: 420px; }
</style>


## 2. Inspiración: rocker-bogie

<div class="row">
  <div class="text">
    El <strong>rocker-bogie</strong> es un sistema de suspensión pasiva diseñado para rovers de exploración planetaria.
    <ul>
        <li>Un <strong>brazo principal (rocker)</strong> por cada lado</li>
        <li>Un <strong>sub-brazo (bogie)</strong> que soporta las dos ruedas traseras</li>
        <li>Un <strong>diferencial mecánico</strong> que conecta ambos lados del rover</li>
    </ul>
    Este diseño permite que <strong>las seis ruedas mantengan contacto con el suelo</strong> incluso en terrenos muy irregulares.

  </div>
  <img src="./figuras/rocker-bogie.jpeg" alt="rocker-bogie" style="max-height: 300px;">
</div>


---

## 3. Ecosistema open-source

<style>
.table-compact {
  width: 100%;
  border-collapse: collapse;
  font-size: 24px;
}
.table-compact th, .table-compact td {
  border: 1px solid #ddd;
  padding: 8px 10px;
  vertical-align: top;
}
.table-compact th {
  background: #f6f7f9;
  text-align: left;
}
.table-compact td:first-child {
  font-weight: 600;
  white-space: nowrap;
}
.note {
  margin-top: 12px;
  font-size: 22px;
  color: #555;
}
</style>

<table class="table-compact">
  <thead>
    <tr>
      <th>Proyecto</th>
      <th>Suspensión</th>
      <th>Dirección</th>
      <th>Estructura</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td>JPL Open Source Rover</td>
      <td>Rocker-bogie</td>
      <td>Delantera y trasera</td>
      <td>Aluminio mecanizado</td>
    </tr>
    <tr>
      <td>Sawppy</td>
      <td>Rocker-bogie</td>
      <td>Delantera y trasera</td>
      <td>Aluminio + piezas impresas en 3D</td>
    </tr>
    <tr>
      <td>ExoMy</td>
      <td>Triple-bogie articulado</td>
      <td>6WS (todas las ruedas)</td>
      <td>Impresión 3D</td>
    </tr>
  </tbody>
</table>


---

## 4. Objetivos de Papaya Pathfinder

- Diseñar un **rover 100 % imprimible en 3D**, reproducible y open-source
- Utilizar una **suspensión tipo rocker-bogie**
- Incorporar **dirección en las ruedas delanteras y traseras**
- Permitir **control remoto**:
    - **WiFi**, mediante una **aplicación Android** o **scripts en Python**, con soporte de **gamepad**
    - **Radio (ELRS)** para control a mayor distancia

---

## 5. Sistemas de control por WiFi

El control del rover se realiza mediante **WiFi**, lo que permite un desarrollo rápido y flexible.

- **Control mediante gamepad**
- Dos clientes disponibles:
    - **Script en Python**
    - **Aplicación Android**
- Ambos generan los **mismos comandos HTTP**
- El rover expone una **API sencilla** para recibir órdenes de movimiento


---


## 5. Sistemas de Control: ELRS

**ExpressLRS (ELRS)** es un sistema de radiocontrol de **código abierto**, diseñado para enlaces de **largo alcance** y **control en tiempo real**.

- Basado en tecnología **LoRa (Long Range)**
- Permite alcances **muy superiores al WiFi**, dependiendo de la configuración y el entorno
- Diseñado para **baja latencia** y alta tasa de refresco en control
- No requiere **infraestructura de red** (routers o puntos de acceso)


---

## 6. Papaya Pathfinder Mini: Diseño mecánico

<img src="./figuras/pathfinder-mini.png" alt="papaya-pathfinder-mini">


---

## 6. Papaya Pathfinder Mini: Electrónica

<img src="./figuras/pathfinder-mini-overview.png" alt="papaya-pathfinder-mini-overview" height="600">


---

## 7. Papaya Pathfinder: Diseño mecánico

<img src="./figuras/pathfinder.png" alt="Papaya Pathfinder - diseño mecánico" height="600">


---

## 7. Papaya Pathfinder: Electrónica

<img src="./figuras/pathfinder-overview.png" alt="papaya-pathfinder-overview" height="500">

---

## 8. Futuros pasos

- Integrar **sensores adicionales**
- Añadir **cámaras**
- Construir una **representación simple del entorno**
- Diseñar un **brazo robótico**

---

<style>
.questions { display: grid; place-items: center; text-align: center; padding: 0 6%; }
h1 { font-size: 86px; color: var(--accent); margin: 0 0 12px; }
p.meta { font-size: 34px; color: #111; margin: 6px 0 0; }
.footer { color: #666; font-size: 28px; margin-top: 20px}
.github { font-size: 26px; margin-top: 14px; }
.github a { color: var(--accent); text-decoration: none; }
.github a:hover { text-decoration: underline; }
</style>

<div class="questions">
  <h1>Preguntas</h1>
  <p class="meta">Papaya Pathfinder: rover 3D open-source inspirado en exploración planetaria</p>
  <p class="meta">Sergio García Sánchez</p>
  <p class="github">
    GitHub: <a href="https://github.com/tronxi/papaya-pathfinder">github.com/tronxi/papaya-pathfinder</a>
  </p>
  <p class="footer">Gracias por su atención</p>
</div>
