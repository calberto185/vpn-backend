/**
 * tutorialSeed.js
 *
 * Seeds tutorialNodes with a hierarchical VPN guide:
 *   VPN (root)
 *   └─ Device type (Teléfonos, Tablets, Desktops)
 *      └─ OS (Android, iPhone, iPad, Windows, Linux, macOS)
 *         └─ App (Hiddify, Happ, v2RayTun, Streisand)
 *            └─ Tabs: Descargar | Instalar | Configurar | Actualizar | FAQ
 *
 * Idempotent: only runs if 'seed-vpn-root' node does NOT exist.
 */

// ── Helpers ───────────────────────────────────────────────────────────────────
function node({ id, parentId = null, title, icon, order, content = [] }) {
  return {
    id, parentId, title, icon, order,
    isVisible: true, content,
    createdAt: new Date('2025-01-01T00:00:00Z'),
    updatedAt: new Date('2025-01-01T00:00:00Z'),
  };
}
function text(html) { return { type: 'text', data: { html } }; }

/**
 * tabs block — uses the format the client HTML already handles:
 * { type: 'tabs', data: { items: [{ label, html }, ...] } }
 */
function tabs(itemsArr) {
  return { type: 'tabs', data: { items: itemsArr } };
}
function tabItem(label, html) { return { label, html }; }

/** Convert a list of step objects to an HTML ordered list */
function stepsHtml(steps) {
  const items = steps.map(s =>
    `<li><strong>${s.label}:</strong> ${s.html}</li>`
  ).join('');
  return `<ol class="list-decimal pl-5 space-y-2">${items}</ol>`;
}

// ── Per-app tab content factories ─────────────────────────────────────────────

function hiddifyTabs(platform) {
  const store = {
    android:       'Google Play',
    'android-tab': 'Google Play',
    iphone:        'App Store',
    ipad:          'App Store',
    windows:       'GitHub Releases',
    linux:         'GitHub Releases',
    macos:         'Mac App Store / GitHub',
  }[platform];

  const downloadHtml = {
    android:
      stepsHtml([
        { label: 'Abrir Google Play', html: 'Abre <strong>Google Play</strong> en tu teléfono.' },
        { label: 'Buscar Hiddify', html: 'Busca <em>Hiddify</em>.' },
        { label: 'Instalar', html: 'Pulsa <strong>Instalar</strong> y espera.' },
      ]),
    'android-tab':
      stepsHtml([
        { label: 'Abrir Google Play', html: 'Abre <strong>Google Play</strong> en tu tablet.' },
        { label: 'Buscar Hiddify', html: 'Busca <em>Hiddify</em>.' },
        { label: 'Instalar', html: 'Pulsa <strong>Instalar</strong> y espera.' },
      ]),
    iphone:
      stepsHtml([
        { label: 'Abrir App Store', html: 'Abre la <strong>App Store</strong>.' },
        { label: 'Buscar Hiddify', html: 'Busca <em>Hiddify Proxy &amp; VPN</em>.' },
        { label: 'Obtener', html: 'Pulsa <strong>Obtener</strong> y autentica con Face ID / Touch ID.' },
      ]),
    ipad:
      stepsHtml([
        { label: 'Abrir App Store', html: 'Abre la <strong>App Store</strong> en tu iPad.' },
        { label: 'Buscar Hiddify', html: 'Busca <em>Hiddify Proxy &amp; VPN</em>.' },
        { label: 'Obtener', html: 'Pulsa <strong>Obtener</strong> y autentica.' },
      ]),
    windows:
      stepsHtml([
        { label: 'Ir a GitHub', html: 'Visita <strong>GitHub Releases</strong> del proyecto Hiddify.' },
        { label: 'Descargar .exe', html: 'Descarga <code>hiddify-windows-x64.exe</code>.' },
        { label: 'Guardar', html: 'Guarda el instalador en tu equipo.' },
      ]),
    linux:
      stepsHtml([
        { label: 'Ir a GitHub', html: 'Visita <strong>GitHub Releases</strong> de Hiddify.' },
        { label: 'Descargar AppImage / deb', html: 'Descarga <code>.AppImage</code> o <code>.deb</code> según tu distro.' },
        { label: 'Permisos', html: 'Ejecuta <code>chmod +x hiddify.AppImage</code> si usas AppImage.' },
      ]),
    macos:
      stepsHtml([
        { label: 'Ir a GitHub o Mac App Store', html: 'Busca <strong>Hiddify</strong> en la Mac App Store o en GitHub Releases.' },
        { label: 'Descargar .dmg', html: 'Descarga el archivo <code>hiddify-macos.dmg</code>.' },
        { label: 'Guardar', html: 'Guarda el .dmg en Descargas.' },
      ]),
  }[platform];

  const installHtml = {
    android:       stepsHtml([{ label: 'Abrir app', html: 'Abre <strong>Hiddify</strong> desde el cajón de apps.' }]),
    'android-tab': stepsHtml([{ label: 'Abrir app', html: 'Abre <strong>Hiddify</strong> desde el cajón de apps de la tablet.' }]),
    iphone:        stepsHtml([{ label: 'Abrir app', html: 'Abre <strong>Hiddify</strong> desde la pantalla de inicio.' }]),
    ipad:          stepsHtml([{ label: 'Abrir app', html: 'Abre <strong>Hiddify</strong> desde la pantalla de inicio del iPad.' }]),
    windows: stepsHtml([
      { label: 'Ejecutar instalador', html: 'Doble clic en el <code>.exe</code>.' },
      { label: 'Aceptar UAC', html: 'Acepta el aviso de control de cuentas.' },
      { label: 'Seguir asistente', html: 'Sigue el asistente y pulsa <strong>Instalar</strong>.' },
    ]),
    linux: stepsHtml([
      { label: 'Instalar paquete', html: 'Ejecuta <code>sudo dpkg -i hiddify.deb</code> o abre el AppImage directamente.' },
      { label: 'Lanzar', html: 'Busca <em>Hiddify</em> en el menú de aplicaciones.' },
    ]),
    macos: stepsHtml([
      { label: 'Abrir .dmg', html: 'Doble clic en el archivo <code>.dmg</code>.' },
      { label: 'Arrastrar', html: 'Arrastra el icono a la carpeta <strong>Aplicaciones</strong>.' },
      { label: 'Abrir', html: 'Abre Hiddify desde Launchpad.' },
    ]),
  }[platform];

  const configureHtml = stepsHtml([
    { label: 'Ir al portal VPN', html: 'Ve a <strong>Dispositivos</strong> y copia tu <strong>enlace de suscripción</strong>.' },
    { label: 'Agregar perfil', html: 'En Hiddify, pulsa <strong>+</strong> → <em>Agregar perfil desde URL</em>.' },
    { label: 'Pegar enlace', html: 'Pega el enlace de suscripción y confirma.' },
    { label: 'Actualizar', html: 'Espera que Hiddify cargue los servidores.' },
    { label: 'Conectar', html: 'Selecciona un servidor y pulsa <strong>Conectar</strong>.' },
  ]);

  const updateHtml = stepsHtml([
    { label: 'Actualizar perfil', html: 'En Hiddify, desliza tu perfil hacia abajo para <strong>actualizar la suscripción</strong>.' },
    { label: 'Actualizar app', html: `Revisa ${store} para nuevas versiones de la aplicación.` },
  ]);

  const faqHtml = `<ul class="list-disc pl-5 space-y-2">
  <li><strong>¿No conecta?</strong> Verifica que el enlace de suscripción sea correcto y esté actualizado.</li>
  <li><strong>¿Velocidad lenta?</strong> Cambia de servidor en la lista de Hiddify.</li>
  <li><strong>¿Perfil expirado?</strong> Renueva tu plan en el portal y actualiza el perfil.</li>
  <li><strong>¿Pide permisos VPN?</strong> Acepta la solicitud del sistema operativo la primera vez.</li>
</ul>`;

  return tabs([
    tabItem('Descargar',            `<p class="mb-3">Descarga <strong>Hiddify</strong> desde <em>${store}</em>.</p>${downloadHtml}`),
    tabItem('Instalar',             installHtml),
    tabItem('Configurar',           configureHtml),
    tabItem('Actualizar',           updateHtml),
    tabItem('Preguntas frecuentes', faqHtml),
  ]);
}

function happTabs(platform) {
  const store = {
    android:       'Google Play',
    'android-tab': 'Google Play',
    iphone:        'App Store',
    ipad:          'App Store',
    windows:       'Sitio oficial / GitHub',
  }[platform];

  const downloadHtml = {
    android:
      stepsHtml([
        { label: 'Abrir Google Play', html: 'Abre <strong>Google Play</strong> en tu teléfono.' },
        { label: 'Buscar Happ', html: 'Busca <em>Happ VPN</em>.' },
        { label: 'Instalar', html: 'Pulsa <strong>Instalar</strong>.' },
      ]),
    'android-tab':
      stepsHtml([
        { label: 'Abrir Google Play', html: 'Abre <strong>Google Play</strong> en tu tablet.' },
        { label: 'Buscar Happ', html: 'Busca <em>Happ VPN</em>.' },
        { label: 'Instalar', html: 'Pulsa <strong>Instalar</strong>.' },
      ]),
    iphone:
      stepsHtml([
        { label: 'Abrir App Store', html: 'Abre la <strong>App Store</strong>.' },
        { label: 'Buscar Happ', html: 'Busca <em>Happ VPN</em>.' },
        { label: 'Obtener', html: 'Pulsa <strong>Obtener</strong> y autentica.' },
      ]),
    ipad:
      stepsHtml([
        { label: 'Abrir App Store', html: 'Abre la <strong>App Store</strong> en tu iPad.' },
        { label: 'Buscar Happ', html: 'Busca <em>Happ VPN</em>.' },
        { label: 'Obtener', html: 'Pulsa <strong>Obtener</strong> y autentica.' },
      ]),
    windows:
      stepsHtml([
        { label: 'Ir al sitio oficial', html: 'Descarga Happ desde su sitio oficial o repositorio.' },
        { label: 'Ejecutar instalador', html: 'Abre el archivo y sigue el asistente de instalación.' },
      ]),
  }[platform];

  const configureHtml = stepsHtml([
    { label: 'Ir al portal VPN', html: 'Ve a <strong>Dispositivos</strong> y copia tu <strong>enlace de suscripción</strong>.' },
    { label: 'Agregar suscripción', html: 'En Happ, pulsa <strong>+</strong> → <em>Importar desde URL</em>.' },
    { label: 'Pegar enlace', html: 'Pega el enlace y guarda.' },
    { label: 'Conectar', html: 'Selecciona un nodo y pulsa <strong>Conectar</strong>.' },
  ]);

  return tabs([
    tabItem('Descargar',            `<p class="mb-3">Descarga <strong>Happ</strong> desde <em>${store}</em>.</p>${downloadHtml}`),
    tabItem('Instalar',             stepsHtml([
      { label: 'Abrir app', html: 'Abre <strong>Happ</strong> una vez instalada.' },
      { label: 'Aceptar permisos', html: 'Acepta los permisos de red solicitados.' },
    ])),
    tabItem('Configurar',           configureHtml),
    tabItem('Actualizar',           stepsHtml([
      { label: 'Actualizar perfil', html: 'Abre Happ y actualiza la suscripción desde el menú de perfiles.' },
      { label: 'Actualizar app', html: `Revisa ${store} para nuevas versiones.` },
    ])),
    tabItem('Preguntas frecuentes', `<ul class="list-disc pl-5 space-y-2">
  <li><strong>¿No conecta?</strong> Verifica el enlace de suscripción en el portal.</li>
  <li><strong>¿App no arranca?</strong> Reinicia el dispositivo e intenta de nuevo.</li>
  <li><strong>¿Velocidad baja?</strong> Prueba cambiar de servidor en la lista de nodos.</li>
  <li><strong>¿Suscripción caducada?</strong> Renueva tu plan en el portal VPN.</li>
</ul>`),
  ]);
}

function v2raytunTabs(platform) {
  const store = {
    android:       'Google Play',
    'android-tab': 'Google Play',
    windows:       'GitHub Releases',
    linux:         'GitHub Releases',
  }[platform];

  const downloadHtml = {
    android:
      stepsHtml([
        { label: 'Abrir Google Play', html: 'Abre <strong>Google Play</strong>.' },
        { label: 'Buscar v2RayTun', html: 'Busca <em>v2RayTun</em>.' },
        { label: 'Instalar', html: 'Pulsa <strong>Instalar</strong>.' },
      ]),
    'android-tab':
      stepsHtml([
        { label: 'Abrir Google Play', html: 'Abre <strong>Google Play</strong> en tu tablet.' },
        { label: 'Buscar v2RayTun', html: 'Busca <em>v2RayTun</em>.' },
        { label: 'Instalar', html: 'Pulsa <strong>Instalar</strong>.' },
      ]),
    windows:
      stepsHtml([
        { label: 'Ir a GitHub', html: 'Visita el repositorio oficial de <strong>v2RayTun</strong>.' },
        { label: 'Descargar .exe', html: 'Descarga el instalador para Windows.' },
        { label: 'Ejecutar', html: 'Abre el instalador y sigue el asistente.' },
      ]),
    linux:
      stepsHtml([
        { label: 'Ir a GitHub', html: 'Visita el repositorio oficial de <strong>v2RayTun</strong>.' },
        { label: 'Descargar paquete', html: 'Descarga el AppImage o paquete <code>.deb</code>.' },
        { label: 'Permisos', html: 'Ejecuta <code>chmod +x archivo.AppImage</code>.' },
      ]),
  }[platform];

  const configureHtml = stepsHtml([
    { label: 'Obtener enlace', html: 'En el portal VPN → <strong>Dispositivos</strong> → copia el <strong>enlace de suscripción</strong> o link <code>vmess://</code>/<code>vless://</code>.' },
    { label: 'Importar', html: 'En v2RayTun, pulsa <strong>+</strong> → <em>Importar desde URL de suscripción</em>.' },
    { label: 'Pegar y guardar', html: 'Pega el enlace y confirma.' },
    { label: 'Conectar', html: 'Selecciona el nodo importado y pulsa <strong>Conectar</strong>.' },
  ]);

  return tabs([
    tabItem('Descargar',            `<p class="mb-3">Descarga <strong>v2RayTun</strong> desde <em>${store}</em>.</p>${downloadHtml}`),
    tabItem('Instalar',             stepsHtml([
      { label: 'Abrir app', html: 'Abre <strong>v2RayTun</strong> desde tus aplicaciones.' },
      { label: 'Aceptar permisos', html: 'Acepta el permiso de red/VPN del sistema.' },
    ])),
    tabItem('Configurar',           configureHtml),
    tabItem('Actualizar',           stepsHtml([
      { label: 'Actualizar suscripción', html: 'Abre la lista de servidores y pulsa <em>Actualizar suscripción</em>.' },
      { label: 'Actualizar app', html: `Revisa ${store} para nuevas versiones.` },
    ])),
    tabItem('Preguntas frecuentes', `<ul class="list-disc pl-5 space-y-2">
  <li><strong>¿Error de protocolo?</strong> Usa el enlace correcto (vmess/vless/trojan).</li>
  <li><strong>¿Sin conexión?</strong> Desactiva y reactiva el toggle VPN.</li>
  <li><strong>¿Nodo no disponible?</strong> Actualiza la suscripción para obtener nodos activos.</li>
  <li><strong>¿Fuga de DNS?</strong> Activa DNS over TLS en la configuración.</li>
</ul>`),
  ]);
}

function streisandTabs(platform) {
  const store = {
    iphone: 'App Store',
    ipad:   'App Store',
    macos:  'Mac App Store',
  }[platform];

  const downloadHtml = {
    iphone:
      stepsHtml([
        { label: 'Abrir App Store', html: 'Abre la <strong>App Store</strong> en tu iPhone.' },
        { label: 'Buscar Streisand', html: 'Busca <em>Streisand</em>.' },
        { label: 'Obtener', html: 'Pulsa <strong>Obtener</strong> y autentica con Face ID / Touch ID.' },
      ]),
    ipad:
      stepsHtml([
        { label: 'Abrir App Store', html: 'Abre la <strong>App Store</strong> en tu iPad.' },
        { label: 'Buscar Streisand', html: 'Busca <em>Streisand</em>.' },
        { label: 'Obtener', html: 'Pulsa <strong>Obtener</strong> y autentica.' },
      ]),
    macos:
      stepsHtml([
        { label: 'Abrir Mac App Store', html: 'Abre la <strong>Mac App Store</strong>.' },
        { label: 'Buscar Streisand', html: 'Busca <em>Streisand VPN</em>.' },
        { label: 'Obtener', html: 'Haz clic en <strong>Obtener</strong> e instala.' },
      ]),
  }[platform];

  const configureHtml = stepsHtml([
    { label: 'Ir al portal VPN', html: 'Ve a <strong>Dispositivos</strong> y copia tu <strong>enlace de suscripción</strong>.' },
    { label: 'Agregar en Streisand', html: 'En Streisand, pulsa <strong>+</strong> → <em>Agregar suscripción</em>.' },
    { label: 'Pegar enlace', html: 'Pega el enlace y confirma.' },
    { label: 'Conectar', html: 'Selecciona un servidor y activa la conexión.' },
  ]);

  return tabs([
    tabItem('Descargar',            `<p class="mb-3">Descarga <strong>Streisand</strong> desde la <em>${store}</em>.</p>${downloadHtml}`),
    tabItem('Instalar',             stepsHtml([
      { label: 'Abrir app', html: 'Una vez instalada, abre <strong>Streisand</strong> desde tu pantalla de inicio.' },
      { label: 'Aceptar permisos', html: 'Acepta el permiso de VPN cuando el sistema lo solicite.' },
    ])),
    tabItem('Configurar',           configureHtml),
    tabItem('Actualizar',           stepsHtml([
      { label: 'Actualizar suscripción', html: 'En Streisand, desliza el perfil para actualizar la lista de servidores.' },
      { label: 'Actualizar app', html: `Revisa la ${store} para nuevas versiones.` },
    ])),
    tabItem('Preguntas frecuentes', `<ul class="list-disc pl-5 space-y-2">
  <li><strong>¿No conecta?</strong> Verifica que el enlace de suscripción sea válido.</li>
  <li><strong>¿App bloqueada en macOS?</strong> Ve a Preferencias del Sistema → Privacidad y permite Streisand.</li>
  <li><strong>¿Velocidad lenta?</strong> Prueba otro servidor de la lista.</li>
  <li><strong>¿Suscripción vencida?</strong> Renueva tu plan en el portal.</li>
</ul>`),
  ]);
}

// ── Node tree ─────────────────────────────────────────────────────────────────

const NODES = [
  // ── Raíz: VPN ─────────────────────────────────────────────────────────────
  node({
    id: 'seed-vpn-root', parentId: null, title: 'VPN', icon: 'fa-solid fa-lock', order: 1,
    content: [text('<p class="text-gray-600">Selecciona tu tipo de dispositivo para ver la guía de configuración paso a paso.</p>')],
  }),

  // ── Nivel 2: Tipos de dispositivo ─────────────────────────────────────────
  node({ id: 'seed-dev-phones',  parentId: 'seed-vpn-root', title: 'Teléfonos Inteligentes', icon: 'fa-solid fa-mobile-screen',          order: 1 }),
  node({ id: 'seed-dev-tablets', parentId: 'seed-vpn-root', title: 'Tablets / iPads',         icon: 'fa-solid fa-tablet-screen-button',    order: 2 }),
  node({ id: 'seed-dev-desktop', parentId: 'seed-vpn-root', title: 'Desktops / Laptops',      icon: 'fa-solid fa-laptop',                 order: 3 }),

  // ── Nivel 3: Sistemas operativos ──────────────────────────────────────────
  node({ id: 'seed-os-android-phone', parentId: 'seed-dev-phones',  title: 'Android', icon: 'fa-brands fa-android', order: 1 }),
  node({ id: 'seed-os-iphone',        parentId: 'seed-dev-phones',  title: 'iPhone',  icon: 'fa-brands fa-apple',   order: 2 }),
  node({ id: 'seed-os-android-tab',   parentId: 'seed-dev-tablets', title: 'Android', icon: 'fa-brands fa-android', order: 1 }),
  node({ id: 'seed-os-ipad',          parentId: 'seed-dev-tablets', title: 'iPad',    icon: 'fa-brands fa-apple',   order: 2 }),
  node({ id: 'seed-os-windows',       parentId: 'seed-dev-desktop', title: 'Windows', icon: 'fa-brands fa-windows', order: 1 }),
  node({ id: 'seed-os-linux',         parentId: 'seed-dev-desktop', title: 'Linux',   icon: 'fa-brands fa-linux',   order: 2 }),
  node({ id: 'seed-os-macos',         parentId: 'seed-dev-desktop', title: 'macOS',   icon: 'fa-brands fa-apple',   order: 3 }),

  // ── Nivel 4: Apps — Android (teléfono) ────────────────────────────────────
  node({ id: 'seed-app-android-hiddify',  parentId: 'seed-os-android-phone', title: 'Hiddify',  icon: 'fa-solid fa-bolt',          order: 1, content: [hiddifyTabs('android')]  }),
  node({ id: 'seed-app-android-happ',     parentId: 'seed-os-android-phone', title: 'Happ',     icon: 'fa-solid fa-circle-dot',    order: 2, content: [happTabs('android')]     }),
  node({ id: 'seed-app-android-v2raytun', parentId: 'seed-os-android-phone', title: 'v2RayTun', icon: 'fa-solid fa-rotate',        order: 3, content: [v2raytunTabs('android')] }),

  // ── Nivel 4: Apps — iPhone ────────────────────────────────────────────────
  node({ id: 'seed-app-iphone-hiddify',   parentId: 'seed-os-iphone', title: 'Hiddify',   icon: 'fa-solid fa-bolt',           order: 1, content: [hiddifyTabs('iphone')]   }),
  node({ id: 'seed-app-iphone-happ',      parentId: 'seed-os-iphone', title: 'Happ',      icon: 'fa-solid fa-circle-dot',     order: 2, content: [happTabs('iphone')]      }),
  node({ id: 'seed-app-iphone-streisand', parentId: 'seed-os-iphone', title: 'Streisand', icon: 'fa-solid fa-shield-halved',  order: 3, content: [streisandTabs('iphone')] }),

  // ── Nivel 4: Apps — Android (tablet) ─────────────────────────────────────
  node({ id: 'seed-app-android-tab-hiddify',  parentId: 'seed-os-android-tab', title: 'Hiddify',  icon: 'fa-solid fa-bolt',       order: 1, content: [hiddifyTabs('android-tab')]  }),
  node({ id: 'seed-app-android-tab-happ',     parentId: 'seed-os-android-tab', title: 'Happ',     icon: 'fa-solid fa-circle-dot', order: 2, content: [happTabs('android-tab')]     }),
  node({ id: 'seed-app-android-tab-v2raytun', parentId: 'seed-os-android-tab', title: 'v2RayTun', icon: 'fa-solid fa-rotate',     order: 3, content: [v2raytunTabs('android-tab')]  }),

  // ── Nivel 4: Apps — iPad ──────────────────────────────────────────────────
  node({ id: 'seed-app-ipad-hiddify',   parentId: 'seed-os-ipad', title: 'Hiddify',   icon: 'fa-solid fa-bolt',          order: 1, content: [hiddifyTabs('ipad')]   }),
  node({ id: 'seed-app-ipad-happ',      parentId: 'seed-os-ipad', title: 'Happ',      icon: 'fa-solid fa-circle-dot',    order: 2, content: [happTabs('ipad')]      }),
  node({ id: 'seed-app-ipad-streisand', parentId: 'seed-os-ipad', title: 'Streisand', icon: 'fa-solid fa-shield-halved', order: 3, content: [streisandTabs('ipad')] }),

  // ── Nivel 4: Apps — Windows ───────────────────────────────────────────────
  node({ id: 'seed-app-windows-hiddify',  parentId: 'seed-os-windows', title: 'Hiddify',  icon: 'fa-solid fa-bolt',       order: 1, content: [hiddifyTabs('windows')]  }),
  node({ id: 'seed-app-windows-happ',     parentId: 'seed-os-windows', title: 'Happ',     icon: 'fa-solid fa-circle-dot', order: 2, content: [happTabs('windows')]     }),
  node({ id: 'seed-app-windows-v2raytun', parentId: 'seed-os-windows', title: 'v2RayTun', icon: 'fa-solid fa-rotate',     order: 3, content: [v2raytunTabs('windows')]  }),

  // ── Nivel 4: Apps — Linux ─────────────────────────────────────────────────
  node({ id: 'seed-app-linux-hiddify',  parentId: 'seed-os-linux', title: 'Hiddify',  icon: 'fa-solid fa-bolt',   order: 1, content: [hiddifyTabs('linux')]  }),
  node({ id: 'seed-app-linux-v2raytun', parentId: 'seed-os-linux', title: 'v2RayTun', icon: 'fa-solid fa-rotate', order: 2, content: [v2raytunTabs('linux')]  }),

  // ── Nivel 4: Apps — macOS ─────────────────────────────────────────────────
  node({ id: 'seed-app-macos-hiddify',   parentId: 'seed-os-macos', title: 'Hiddify',   icon: 'fa-solid fa-bolt',          order: 1, content: [hiddifyTabs('macos')]   }),
  node({ id: 'seed-app-macos-streisand', parentId: 'seed-os-macos', title: 'Streisand', icon: 'fa-solid fa-shield-halved', order: 2, content: [streisandTabs('macos')] }),
];

/**
 * Idempotent seed: checks for 'seed-vpn-root'. If missing (first run or old
 * structure), wipes the collection and inserts the new hierarchy.
 */
async function seedTutorial(db, { nameCollections }) {
  try {
    const col = db.collection(nameCollections.tutorialNodes);
    const vpnRoot = await col.findOne({ id: 'seed-vpn-root' });
    if (vpnRoot) return; // already seeded

    await col.deleteMany({});
    await col.insertMany(NODES);
    console.log(`✅ [Tutorial] Seeded ${NODES.length} nodes (VPN → devices → OS → apps).`);
  } catch (e) {
    console.error('[Tutorial] Seed error:', e.message);
  }
}

module.exports = { seedTutorial };
