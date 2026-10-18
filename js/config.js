/*
 * =====================================================================
 *  WEBSITE SETTINGS: edit this file to update the website.
 * =====================================================================
 *  Everything on the site that may change (contact details, WhatsApp
 *  number, map, gallery photos) is kept here, so you only change it
 *  in one place. Leave a value as "" (empty) if it is not confirmed
 *  yet; the website will show "To be confirmed" instead.
 * =====================================================================
 */
window.SITE_CONFIG = {
  companyName: "GM Scrapmetal Limited",

  /* ---- Contact details ------------------------------------------- */
  phones: ["+255 615 741 017", "+255 657 440 267"], // add or remove numbers here
  whatsapp: "+255 748 207 225",                 // international format
  email: "gmmetalsscrap@gmail.com",
  address: "Lindi Street, Ilala, Dar es Salaam, Tanzania",
  businessHours: "",                            // e.g. "Mon–Sat, 8:00–17:00"

  /* Google Map shown on the Contact page ("" = no map) */
  mapEmbedUrl:
    "https://www.google.com/maps?q=Lindi+Street,+Ilala,+Dar+es+Salaam,+Tanzania&output=embed",

  /* ---- Enquiry forms ----------------------------------------------
   * formspreeEndpoint: every form submission is emailed to you by
   *   Formspree and saved in your Formspree inbox ("" = off).
   * openWhatsApp: true  = also open WhatsApp with the enquiry ready
   *               false = email only (shows "Enquiry sent")
   */
  forms: {
    formspreeEndpoint: "https://formspree.io/f/xrpedbbw",
    openWhatsApp: true,
  },

  /* ---- Pre-written WhatsApp messages ------------------------------ */
  whatsappMessages: {
    general: "Hello GM Scrapmetal Limited, I would like to get in touch with your team.",
    supplier: "Hello GM Scrapmetal Limited, I would like to offer scrap materials. Please let me know how to proceed.",
    buyer: "Hello GM Scrapmetal Limited, I would like to enquire about scrap material availability.",
  },

  /* ---- Supabase: admin login, gallery, enquiries, settings ---------
   * Paste the two values from your Supabase project here
   * (README.md → "Admin dashboard setup", step 3).
   *   url:     Project Settings → Data API → Project URL
   *   anonKey: Project Settings → API Keys → "anon public" key
   *            (or the "publishable" key, starts with sb_publishable_)
   * These two values are SAFE to be public: the security rules in
   * setup/supabase-setup.sql decide what each visitor may do.
   * NEVER paste the "service_role" or "secret" key here.
   */
  supabase: {
    url: "https://apxdppjggckucftegnox.supabase.co",
    anonKey: "",   // e.g. "eyJhbGciOi..." or "sb_publishable_..."
  },

  /* ---- Gallery ("Our Work" page) ----------------------------------
   * The easiest way to add photos is the admin page (admin.html).
   * You can also list photos here by hand:
   * Only add GENUINE photographs of GM Scrapmetal work.
   * 1. Copy the photo into the  images/gallery/  folder
   *    (JPG, ideally under 500 KB and about 1600 px wide).
   * 2. Add an entry below. The order here is the order on the page.
   *
   * Example:
   *   {
   *     image: "images/gallery/loading-steel-oct-2026.jpg",
   *     alt: "Workers loading steel scrap onto a truck",
   *     caption: "Loading steel scrap for delivery",
   *     category: "Projects",
   *     date: "2026-10-12",
   *   },
   */
  galleryCategories: ["Scrap Metal", "Materials", "Equipment", "Collection", "Projects"],
  gallery: [
    // add photos here
  ],
};
