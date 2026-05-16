const { getDB, nameCollections } = require("../services/dbServices");
const { v4: uuidv4 } = require("uuid");
const PublicContentEntity = require("../models/publicContentEntity");

function getDefaultHomeContent() {
  return {
    slug: "home",
    active: true,
    navbar: {
      brandName: { es: "CarlosVM", en: "CarlosVM", ru: "CarlosVM" },
      brandAccent: { es: "Digital", en: "Digital", ru: "Digital" },
    },
    hero: {
      badge: {
        es: "Servicio de protección digital activo",
        en: "Digital protection service active",
        ru: "Сервис цифровой защиты активен",
      },
      title: {
        es: "Internet privado. Seguro. Global.",
        en: "Private internet. Secure. Global.",
        ru: "Приватный интернет. Безопасный. Глобальный.",
      },
      accentText: { es: "Seguro.", en: "Secure.", ru: "Безопасный." },
      description: {
        es: "Accede a cualquier plataforma del mundo a través de un canal de datos cifrado y completamente privado. Sin rastreos, sin restricciones.",
        en: "Access any platform in the world through a fully encrypted and private data channel. No tracking, no restrictions.",
        ru: "Получите доступ к любой платформе через полностью зашифрованный и приватный канал данных. Без отслеживания и ограничений.",
      },
      primaryCtaLabel: { es: "Crear cuenta", en: "Create account", ru: "Создать аккаунт" },
      primaryCtaRoute: "/auth/register",
      secondaryCtaLabel: { es: "Ver planes", en: "View plans", ru: "Смотреть планы" },
      secondaryCtaHref: "#precios",
      highlights: [
        { es: "Sin registros de actividad", en: "No activity logs", ru: "Без журналов активности" },
        { es: "Cancela cuando quieras", en: "Cancel anytime", ru: "Отмена в любое время" },
        { es: "+30 países disponibles", en: "+30 countries available", ru: "+30 стран доступно" },
      ],
      panelLabel: { es: "CONEXIÓN ACTIVA", en: "ACTIVE CONNECTION", ru: "АКТИВНОЕ СОЕДИНЕНИЕ" },
      panelStatus: { es: "Protegido", en: "Protected", ru: "Защищён" },
      metrics: [
        { label: { es: "Disponibilidad", en: "Availability", ru: "Доступность" }, value: "99.9%", caption: { es: "Uptime garantizado", en: "Guaranteed uptime", ru: "Гарантированный аптайм" } },
        { label: { es: "Latencia", en: "Latency", ru: "Задержка" }, value: "<100ms", caption: { es: "Promedio internacional", en: "International average", ru: "Международный показатель" } },
        { label: { es: "Cobertura", en: "Coverage", ru: "Покрытие" }, value: "30+", caption: { es: "Países disponibles", en: "Countries available", ru: "Стран доступно" } },
        { label: { es: "Soporte", en: "Support", ru: "Поддержка" }, value: "24/7", caption: { es: "Atención técnica", en: "Technical support", ru: "Техподдержка" } },
      ],
    },
    mediaShowcase: {
      title: {
        es: "Contenido principal administrable",
        en: "Manageable main content",
        ru: "Управляемый основной контент",
      },
      description: {
        es: "Esta sección permite gestionar mensajes promocionales y material multimedia para la portada.",
        en: "This section allows managing promotional messages and multimedia material for the homepage.",
        ru: "Этот раздел позволяет управлять рекламными сообщениями и мультимедиа для главной страницы.",
      },
      items: [
        {
          id: "home-image-1",
          type: "image",
          title: { es: "Panel de monitoreo", en: "Monitoring panel", ru: "Панель мониторинга" },
          description: {
            es: "Imagen destacada para mostrar el panel o cualquier visual principal del servicio.",
            en: "Featured image to show the panel or any main visual of the service.",
            ru: "Изображение для отображения панели или основного визуала сервиса.",
          },
          url: "https://images.unsplash.com/photo-1558494949-ef010cbdcc31?q=80&w=1200&auto=format&fit=crop",
          poster: "",
          ctaLabel: { es: "Crear cuenta", en: "Create account", ru: "Создать аккаунт" },
          ctaHref: "/auth/register",
        },
        {
          id: "home-video-1",
          type: "video",
          title: { es: "Video demo", en: "Demo video", ru: "Демо-видео" },
          description: {
            es: "Video embebido o promocional para explicar la propuesta de valor del servicio.",
            en: "Embedded or promotional video to explain the service's value proposition.",
            ru: "Встроенное или рекламное видео для объяснения ценности сервиса.",
          },
          url: "https://www.w3schools.com/html/mov_bbb.mp4",
          poster: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=1200&auto=format&fit=crop",
          ctaLabel: { es: "Ver planes", en: "View plans", ru: "Смотреть планы" },
          ctaHref: "#precios",
        },
      ],
    },
    stats: [
      { value: "30+", label: { es: "Países disponibles", en: "Countries available", ru: "Стран доступно" } },
      { value: "99.9%", label: { es: "Disponibilidad", en: "Availability", ru: "Доступность" } },
      { value: "24/7", label: { es: "Soporte técnico", en: "Technical support", ru: "Техподдержка" } },
    ],
    advantages: {
      eyebrow: { es: "Por qué elegirnos", en: "Why choose us", ru: "Почему мы" },
      title: {
        es: "Todo lo que necesitas para navegar con libertad",
        en: "Everything you need to browse freely",
        ru: "Всё для свободного серфинга",
      },
      description: {
        es: "Tecnología de privacidad diseñada para el uso diario, sin complicaciones técnicas.",
        en: "Privacy technology designed for daily use, without technical complications.",
        ru: "Технология приватности для ежедневного использования без технических сложностей.",
      },
      items: [
        {
          id: "adv-1",
          title: { es: "Cifrado de extremo a extremo", en: "End-to-end encryption", ru: "Сквозное шифрование" },
          description: {
            es: "Tu tráfico viaja completamente cifrado desde tu dispositivo hasta el destino final.",
            en: "Your traffic travels fully encrypted from your device to the final destination.",
            ru: "Ваш трафик полностью зашифрован от вашего устройства до конечного адресата.",
          },
        },
        {
          id: "adv-2",
          title: { es: "Política estricta de cero registros", en: "Strict no-logs policy", ru: "Строгая политика без логов" },
          description: {
            es: "No almacenamos historial de navegación ni datos de actividad.",
            en: "We do not store browsing history or activity data.",
            ru: "Мы не храним историю браузера или данные активности.",
          },
        },
        {
          id: "adv-3",
          title: { es: "Acceso a internet global", en: "Global internet access", ru: "Глобальный доступ в интернет" },
          description: {
            es: "Conéctate a nodos en múltiples países y accede a servicios globales sin fricción.",
            en: "Connect to nodes in multiple countries and access global services without friction.",
            ru: "Подключайтесь к узлам в разных странах и получайте доступ к глобальным сервисам.",
          },
        },
      ],
    },
    howItWorks: {
      eyebrow: { es: "Proceso", en: "Process", ru: "Процесс" },
      title: {
        es: "Activo en menos de 5 minutos",
        en: "Active in less than 5 minutes",
        ru: "Активно менее чем за 5 минут",
      },
      description: {
        es: "Sin instalaciones complicadas. Funciona desde el primer clic.",
        en: "No complicated installations. Works from the first click.",
        ru: "Без сложных установок. Работает с первого клика.",
      },
      steps: [
        {
          id: "step-1",
          title: { es: "Crea tu cuenta", en: "Create your account", ru: "Создайте аккаунт" },
          description: {
            es: "Regístrate en menos de un minuto con tu correo electrónico.",
            en: "Sign up in less than a minute with your email.",
            ru: "Зарегистрируйтесь менее чем за минуту с вашим email.",
          },
        },
        {
          id: "step-2",
          title: { es: "Elige tu plan", en: "Choose your plan", ru: "Выберите план" },
          description: {
            es: "Selecciona el plan que mejor se ajuste a tus necesidades.",
            en: "Select the plan that best fits your needs.",
            ru: "Выберите план, который лучше всего подходит для ваших нужд.",
          },
        },
        {
          id: "step-3",
          title: { es: "Conéctate y navega", en: "Connect and browse", ru: "Подключитесь и просматривайте" },
          description: {
            es: "Activa tu servicio y accede a internet privado de inmediato.",
            en: "Activate your service and access private internet immediately.",
            ru: "Активируйте сервис и получите доступ к приватному интернету немедленно.",
          },
        },
      ],
    },
    cta: {
      title: {
        es: "Empieza a navegar con privacidad",
        en: "Start browsing privately",
        ru: "Начните приватный серфинг",
      },
      description: {
        es: "Configura el mensaje final y las acciones principales de la portada desde el backend.",
        en: "Configure the final message and main actions of the homepage from the backend.",
        ru: "Настройте финальное сообщение и основные действия главной страницы.",
      },
      primaryLabel: { es: "Crear cuenta gratuita", en: "Create free account", ru: "Создать бесплатный аккаунт" },
      primaryRoute: "/auth/register",
      secondaryLabel: { es: "Ver planes", en: "View plans", ru: "Смотреть планы" },
      secondaryHref: "#precios",
      note: {
        es: "Sin tarjeta de crédito · Activación inmediata",
        en: "No credit card · Immediate activation",
        ru: "Без кредитной карты · Немедленная активация",
      },
    },
    footer: {
      brandName: { es: "CarlosVM", en: "CarlosVM", ru: "CarlosVM" },
      brandSuffix: { es: "Digital", en: "Digital", ru: "Digital" },
      description: {
        es: "Servicio de privacidad y acceso seguro a internet para usuarios de todo el mundo.",
        en: "Privacy and secure internet access service for users worldwide.",
        ru: "Сервис приватности и безопасного доступа в интернет для пользователей по всему миру.",
      },
      bottomText: {
        es: "Privacidad garantizada · Sin registros de actividad · Infraestructura global",
        en: "Privacy guaranteed · No activity logs · Global infrastructure",
        ru: "Гарантия приватности · Без журналов активности · Глобальная инфраструктура",
      },
    },
  };
}

async function get(req, res) {
  try {
    const buildAggregate = [
      {
        $match: {
          global: true,
          active: true,
          visible: true,
        },
      },
      {
        $project: {
          _id: 0,
          id: 1,
          title_prefix: 1,
          title_name: 1,
          title_suffix: 1,
          price: 1,
          description: 1,
          features: 1,
          button_name: 1,
          kind: 1,
          global: 1,
          main: 1,
          language: 1,
          active: 1,
          visible: 1,
          currencyName: 1,
          currencyCode: 1,
          currencySymbol: 1,
          currencyFormat: 1,
          limitDevices: 1,
          "service.sortName": 1,
          "service.longName": 1,
          "service.Description": 1,
          "service.picture": 1,
          "service.state": 1,
        },
      },
    ];

    const db = getDB();
    const result = await db.collection(nameCollections.plans).aggregate(buildAggregate).toArray();
    res.status(200).send({ code: "registros", status: 200, message: "✅ Consulta exitosamente!.", data: result });
  } catch (error) {
    console.log("error: ", error);
    res.status(500).send({ code: "error", status: 500, message: "Error al realizar la consulta!" });
  }
}

async function getHomeContent(req, res) {
  try {
    const db = getDB();
    const existing = await db.collection(nameCollections.publicContents).findOne(
      { slug: "home", active: true },
      { projection: { _id: 0 } }
    );

    const payload = existing || getDefaultHomeContent();
    res.status(200).send({
      code: "home_content",
      status: 200,
      message: "✅ Contenido público obtenido correctamente.",
      data: payload,
    });
  } catch (error) {
    console.log("public getHomeContent error:", error);
    res.status(500).send({ code: "error", status: 500, message: "Error al obtener el contenido público" });
  }
}

async function upsertHomeContent(req, res) {
  try {
    const db = getDB();
    const existing = await db.collection(nameCollections.publicContents).findOne({ slug: "home" });

    const entity = new PublicContentEntity();
    entity.set(getDefaultHomeContent());
    if (existing) entity.set(existing);
    entity.set(req.body);

    entity.id = existing?.id || entity.id || uuidv4();
    entity.slug = "home";
    entity.updatedAt = new Date();
    entity.createdAt = existing?.createdAt || entity.createdAt || new Date();

    const dataToSave = entity.get();

    await db.collection(nameCollections.publicContents).updateOne(
      { slug: "home" },
      { $set: dataToSave },
      { upsert: true }
    );

    res.status(200).send({
      code: "updated",
      status: 200,
      message: "✅ Contenido público actualizado exitosamente.",
      data: dataToSave,
    });
  } catch (error) {
    console.log("public upsertHomeContent error:", error);
    res.status(500).send({ code: "error", status: 500, message: error.message || "Error al actualizar el contenido público" });
  }
}

module.exports = {
  get,
  getHomeContent,
  upsertHomeContent,
};
