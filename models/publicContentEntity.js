class PublicContentEntity {
  id = "";
  slug = "home";
  active = true;
  navbar = {
    brandName: "CarlosVM",
    brandAccent: "Digital",
  };
  hero = {
    badge: "",
    title: "",
    accentText: "",
    description: "",
    primaryCtaLabel: "",
    primaryCtaRoute: "/auth/register",
    secondaryCtaLabel: "",
    secondaryCtaHref: "#precios",
    highlights: [],
    panelLabel: "",
    panelStatus: "",
    metrics: [],
  };
  mediaShowcase = {
    title: "",
    description: "",
    items: [],
  };
  stats = [];
  advantages = {
    eyebrow: "",
    title: "",
    description: "",
    items: [],
  };
  howItWorks = {
    eyebrow: "",
    title: "",
    description: "",
    steps: [],
  };
  cta = {
    title: "",
    description: "",
    primaryLabel: "",
    primaryRoute: "/auth/register",
    secondaryLabel: "",
    secondaryHref: "#precios",
    note: "",
  };
  footer = {
    brandName: "CarlosVM",
    brandSuffix: "Digital",
    description: "",
    bottomText: "",
  };
  createdAt = new Date();
  updatedAt = new Date();

  set({
    id,
    slug,
    active,
    navbar,
    hero,
    mediaShowcase,
    stats,
    advantages,
    howItWorks,
    cta,
    footer,
    createdAt,
    updatedAt,
  } = {}) {
    this.id = id ?? this.id;
    this.slug = slug ?? this.slug;
    this.active = active ?? this.active;
    this.navbar = { ...this.navbar, ...(navbar ?? {}) };
    this.hero = { ...this.hero, ...(hero ?? {}) };
    this.mediaShowcase = { ...this.mediaShowcase, ...(mediaShowcase ?? {}) };
    this.stats = Array.isArray(stats) ? stats : this.stats;
    this.advantages = { ...this.advantages, ...(advantages ?? {}) };
    this.howItWorks = { ...this.howItWorks, ...(howItWorks ?? {}) };
    this.cta = { ...this.cta, ...(cta ?? {}) };
    this.footer = { ...this.footer, ...(footer ?? {}) };
    this.createdAt = createdAt ?? this.createdAt;
    this.updatedAt = updatedAt ?? this.updatedAt;
  }

  get() {
    if (!this.id) throw new Error("The id field is required!.");
    if (!this.slug) throw new Error("The slug field is required!.");
    if (!this.hero?.title) throw new Error("The hero.title field is required!.");
    return this;
  }
}

module.exports = PublicContentEntity;
