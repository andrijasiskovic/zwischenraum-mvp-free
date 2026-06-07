import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const config = {
  url: window.ZWISCHENRAUM_SUPABASE_URL || "",
  anonKey: window.ZWISCHENRAUM_SUPABASE_ANON_KEY || "",
};

const app = document.querySelector("#app");
const todayIso = new Date().toISOString().slice(0, 10);

const state = {
  supabase: null,
  session: null,
  profile: null,
  memberships: [],
  organization: null,
  selectedOrganizationId: "",
  settings: null,
  preset: null,
  clients: [],
  groups: [],
  groupMembers: [],
  taskBatches: [],
  batchRecipients: [],
  groupSchemaMissing: false,
  batchSchemaMissing: false,
  organizationMembers: [],
  tasks: [],
  reflections: [],
  attachments: [],
  notes: [],
  templates: [],
  invitations: [],
  presets: [],
  inviteInfo: null,
  inviteLookupTimer: null,
  view: "dashboard",
  filter: "open",
  selectedClientId: "",
  busy: false,
  resetToDashboardAfterAuth: false,
  message: "",
  error: "",
  toast: null,
  toastTimer: null,
  modalTask: null,
  taskComposerOpen: false,
  readerModal: null,
  groupEditor: null,
  batchModalId: "",
  lastInviteId: "",
  inviteModalId: "",
  editingTemplateId: "",
  reminderModalClientId: "",
  selectedTaskClientIds: [],
  selectedTaskGroupIds: [],
  clientSearch: "",
  clientPickerOpen: false,
  mobileMenuOpen: false,
  clientDirectorySearch: "",
};

function inviteParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    code: params.get("invite") || params.get("code") || "",
    email: params.get("email") || "",
    role: params.get("role") || "",
    hasInviteLink: params.has("invite") || params.has("code") || params.has("email"),
  };
}

function isSetupMode() {
  return (
    window.ZWISCHENRAUM_ALLOW_WORKSPACE_SETUP === true &&
    new URLSearchParams(window.location.search).get("setup") === "1"
  );
}

function isPlatformOwner() {
  return String(state.session?.user?.email || "").toLowerCase() === "andrija.siskovic@gmail.com";
}

function showToast(text) {
  const id = `${Date.now()}-${Math.random()}`;
  state.toast = { id, text };
  if (state.toastTimer) clearTimeout(state.toastTimer);
  state.toastTimer = window.setTimeout(() => {
    if (state.toast?.id !== id) return;
    state.toast = null;
    renderApp();
  }, 3000);
}

function pendingInviteKey(email) {
  return `momentum.pendingInvite.${String(email || "").toLowerCase()}`;
}

function rememberPendingInvite(email, code, presetId = "", companyName = "") {
  if (email && code) {
    window.localStorage.setItem(
      pendingInviteKey(email),
      JSON.stringify({
        code,
        presetId,
        companyName,
      }),
    );
  }
}

function popPendingInvite(email) {
  const key = pendingInviteKey(email);
  const rawValue = window.localStorage.getItem(key);
  if (rawValue) {
    window.localStorage.removeItem(key);
  }
  if (!rawValue) return null;

  try {
    const parsed = JSON.parse(rawValue);
    return {
      code: parsed.code || "",
      presetId: parsed.presetId || "",
      companyName: parsed.companyName || "",
    };
  } catch {
    return {
      code: rawValue,
      presetId: "",
      companyName: "",
    };
  }
}

const escapeHtml = (value = "") =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

function textToRichHtml(value = "") {
  const text = String(value || "").trim();
  if (!text) return "";
  const lines = text.split(/\r?\n/);
  const html = [];
  let listType = "";

  const closeList = () => {
    if (listType) {
      html.push(`</${listType}>`);
      listType = "";
    }
  };

  lines.forEach((line) => {
    const trimmed = line.trim();
    const bullet = trimmed.match(/^[-*]\s+(.+)/);
    const numbered = trimmed.match(/^\d+[.)]\s+(.+)/);

    if (!trimmed) {
      closeList();
      return;
    }

    if (bullet || numbered) {
      const nextListType = bullet ? "ul" : "ol";
      if (listType !== nextListType) {
        closeList();
        listType = nextListType;
        html.push(`<${listType}>`);
      }
      html.push(`<li>${escapeHtml(bullet?.[1] || numbered?.[1] || "")}</li>`);
      return;
    }

    closeList();
    html.push(`<p>${escapeHtml(trimmed).replaceAll("  ", " &nbsp;")}</p>`);
  });

  closeList();
  return html.join("");
}

function looksLikeHtml(value = "") {
  return /<\/?(p|br|ul|ol|li|strong|b|em|i|u|h[1-6]|a|span)\b/i.test(String(value || ""));
}

function sanitizeRichText(value = "") {
  const rawValue = String(value || "").trim();
  if (!rawValue) return "";
  const source = looksLikeHtml(rawValue) ? rawValue : textToRichHtml(rawValue);
  const template = document.createElement("template");
  template.innerHTML = source;
  const allowedTags = new Set(["P", "BR", "UL", "OL", "LI", "STRONG", "B", "EM", "I", "U", "H3", "H4", "A", "SPAN"]);
  const allowedStyles = new Set(["color"]);

  template.content.querySelectorAll("*").forEach((node) => {
    if (!allowedTags.has(node.tagName)) {
      node.replaceWith(...Array.from(node.childNodes));
      return;
    }

    [...node.attributes].forEach((attribute) => {
      const name = attribute.name.toLowerCase();
      if (node.tagName === "A" && name === "href") {
        const href = attribute.value.trim();
        if (/^(https?:|mailto:|tel:)/i.test(href)) {
          node.setAttribute("target", "_blank");
          node.setAttribute("rel", "noopener noreferrer");
          return;
        }
      }
      if (name === "style") {
        const color = node.style.color;
        node.removeAttribute("style");
        if (color && allowedStyles.has("color")) node.style.color = color;
        return;
      }
      node.removeAttribute(attribute.name);
    });
  });

  return template.innerHTML.trim();
}

function richTextToHtml(value = "") {
  return sanitizeRichText(value);
}

function richTextPlain(value = "") {
  const template = document.createElement("template");
  template.innerHTML = richTextToHtml(value);
  return template.content.textContent?.trim() || "";
}

function richTextPreviewNeedsToggle(value = "") {
  const html = richTextToHtml(value);
  const plain = richTextPlain(html);
  return plain.length > 180 || (html.match(/<(p|li|br|ul|ol|h3|h4)\b/gi) || []).length > 3;
}

function renderRichPreview(value = "", emptyText = "Keine Beschreibung", className = "") {
  const html = richTextToHtml(value) || `<p>${escapeHtml(emptyText)}</p>`;
  const canExpand = richTextPreviewNeedsToggle(value);
  return `
    <div class="rich-preview ${className} ${canExpand ? "can-expand" : ""}" data-rich-preview>
      <div class="rich-preview-content">${html}</div>
      ${
        canExpand
          ? `<button type="button" class="text-toggle" data-toggle-rich-preview>Mehr anzeigen</button>`
          : ""
      }
    </div>
  `;
}

function renderRichTextField(name, label, value = "", options = {}) {
  const id = `rich-${name}-${Math.random().toString(36).slice(2)}`;
  const html = richTextToHtml(value);
  const required = options.required ? "required" : "";
  const editorRequired = options.required ? `data-rich-required="true"` : "";
  const placeholder = options.placeholder || "";
  return `
    <label class="field rich-field">
      <span>${escapeHtml(label)}</span>
      <input type="hidden" id="${id}" name="${escapeHtml(name)}" value="${escapeHtml(html)}" ${required} />
      <div class="rich-editor-shell">
        <div class="rich-toolbar" aria-label="Text formatieren">
          <button type="button" data-rich-command="bold" title="Fett"><strong>B</strong></button>
          <button type="button" data-rich-command="italic" title="Kursiv"><em>I</em></button>
          <button type="button" data-rich-command="underline" title="Unterstrichen"><u>U</u></button>
          <button type="button" data-rich-command="insertUnorderedList" title="Aufzählung">•</button>
          <button type="button" data-rich-command="insertOrderedList" title="Nummerierung">1.</button>
          <button type="button" data-rich-command="outdent" title="Einzug verringern">‹</button>
          <button type="button" data-rich-command="indent" title="Einzug erhöhen">›</button>
          <select data-rich-block title="Absatzformat">
            <option value="p">Text</option>
            <option value="h3">Überschrift</option>
            <option value="h4">Zwischentitel</option>
          </select>
          <button type="button" data-rich-link title="Link einfügen">Link</button>
          <input type="color" data-rich-color title="Textfarbe" value="#18211f" />
        </div>
        <div
          class="rich-editor"
          contenteditable="true"
          role="textbox"
          aria-multiline="true"
          data-rich-editor
          data-rich-input="${id}"
          ${editorRequired}
          data-placeholder="${escapeHtml(placeholder)}"
        >${html}</div>
      </div>
    </label>
  `;
}

function syncRichEditor(editor) {
  const input = document.getElementById(editor.dataset.richInput || "");
  if (!input) return;
  const html = richTextToHtml(editor.innerHTML);
  input.value = html;
  editor.classList.toggle("is-empty", !richTextPlain(html));
}

function syncRichEditors(root = document) {
  root.querySelectorAll("[data-rich-editor]").forEach(syncRichEditor);
}

function richEditorForControl(control) {
  return control.closest(".rich-editor-shell")?.querySelector("[data-rich-editor]");
}

function setRichEditorValue(editor, value = "") {
  editor.innerHTML = richTextToHtml(value);
  syncRichEditor(editor);
}

function applyRichCommand(control, command, value = null) {
  const editor = richEditorForControl(control);
  if (!editor) return;
  editor.focus();
  document.execCommand(command, false, value);
  syncRichEditor(editor);
}

function normalizedPasteHtml(event) {
  const html = event.clipboardData?.getData("text/html") || "";
  if (html) return richTextToHtml(html);
  const text = event.clipboardData?.getData("text/plain") || "";
  return textToRichHtml(text);
}

function renderFileField(label = "Dateien anhängen") {
  return `
    <label class="field file-field">
      <span>${escapeHtml(label)}</span>
      <input
        name="attachment_files"
        type="file"
        multiple
        data-file-input
        accept="image/*,video/*,application/pdf,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip"
      />
      <small class="muted">Bilder, Videos, PDFs und gängige Dokumente bis 50 MB pro Datei.</small>
      <div class="file-selection" data-file-selection aria-live="polite"></div>
    </label>
  `;
}

function formatFileSize(size = 0) {
  const numericSize = Number(size || 0);
  if (numericSize >= 1048576) return `${(numericSize / 1048576).toFixed(1)} MB`;
  if (numericSize >= 1024) return `${Math.round(numericSize / 1024)} KB`;
  return numericSize ? `${numericSize} B` : "";
}

function renderSelectedFiles(input) {
  const container = input.closest(".file-field")?.querySelector("[data-file-selection]");
  if (!container) return;
  const files = [...(input.files || [])];
  if (!files.length) {
    container.innerHTML = "";
    return;
  }
  container.innerHTML = files
    .map(
      (file) => `
        <span class="file-selection-chip">
          <strong>${escapeHtml(file.name)}</strong>
          <small>${escapeHtml(formatFileSize(file.size))}</small>
        </span>
      `,
    )
    .join("");
}

function showFormSubmitError(form, message) {
  const errorEl = form.querySelector("[data-submit-error]");
  if (!errorEl) return false;
  errorEl.textContent = message;
  errorEl.hidden = false;
  errorEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
  return true;
}

function clearFormSubmitError(form) {
  const errorEl = form.querySelector("[data-submit-error]");
  if (!errorEl) return;
  errorEl.textContent = "";
  errorEl.hidden = true;
}

function resetTaskComposerState() {
  state.selectedTaskClientIds = [];
  state.selectedTaskGroupIds = [];
  state.clientSearch = "";
  state.clientPickerOpen = false;
}

function attachmentLabel(attachment) {
  const formattedSize = formatFileSize(attachment.file_size);
  return formattedSize ? `${attachment.file_name} · ${formattedSize}` : attachment.file_name;
}

function renderAttachmentList(attachments = []) {
  if (!attachments.length) return "";
  return `
    <div class="attachment-list" aria-label="Anhänge">
      ${attachments
        .map(
          (attachment) => `
            <button type="button" class="attachment-chip" data-open-attachment="${attachment.id}">
              <span>${escapeHtml(fileIcon(attachment.file_type))}</span>
              <strong>${escapeHtml(attachmentLabel(attachment))}</strong>
            </button>
          `,
        )
        .join("")}
    </div>
  `;
}

function fileIcon(fileType = "") {
  if (fileType.startsWith("image/")) return "Bild";
  if (fileType.startsWith("video/")) return "Video";
  if (fileType === "application/pdf") return "PDF";
  return "Datei";
}

function missingAttachmentSchema(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("task_attachments") || message.includes("task-attachments") || error?.code === "42P01";
}

function missingGroupSchema(error) {
  const message = String(error?.message || "").toLowerCase();
  return message.includes("client_groups") || message.includes("client_group_members") || error?.code === "42P01";
}

function missingBatchSchema(error) {
  const message = String(error?.message || "").toLowerCase();
  return (
    message.includes("assignment_batches") ||
    message.includes("assignment_batch_recipients") ||
    message.includes("assignment_batch_id") ||
    error?.code === "42P01" ||
    error?.code === "42703"
  );
}

function personName(person, fallback = "Unbekannt") {
  const fullName = String(person?.full_name || "").trim();
  if (fullName) return fullName;
  return person?.email || fallback;
}

function personEmail(person) {
  return person?.contact_email || person?.email || "";
}

const formatDate = (date) =>
  new Intl.DateTimeFormat("de-AT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));

const isOverdue = (task) => task.status === "open" && task.due_date < todayIso;
const currentRole = () =>
  state.memberships.find((item) => item.organization_id === state.organization?.id)?.role || "";
const isCoachRole = () => ["owner", "coach"].includes(currentRole());
const activeClientMemberIds = () =>
  new Set(
    state.organizationMembers
      .filter((member) => member.role === "client" && member.active)
      .map((member) => member.user_id),
  );
const rolePriority = (role = "") => ({ owner: 0, coach: 1, client: 2 })[role] ?? 9;

function workspaceStorageKey() {
  return `momentum.activeWorkspace.${state.session?.user?.id || "anonymous"}`;
}

function rememberActiveWorkspace(orgId = "") {
  state.selectedOrganizationId = orgId;
  if (orgId) {
    window.localStorage.setItem(workspaceStorageKey(), orgId);
  } else {
    window.localStorage.removeItem(workspaceStorageKey());
  }
}

function resetNavigationState() {
  state.view = "dashboard";
  state.filter = "open";
  state.selectedClientId = "";
  state.modalTask = null;
  state.readerModal = null;
  state.groupEditor = null;
  state.batchModalId = "";
  state.lastInviteId = "";
  state.inviteModalId = "";
  state.editingTemplateId = "";
  state.reminderModalClientId = "";
  state.selectedTaskClientIds = [];
  state.selectedTaskGroupIds = [];
  state.clientSearch = "";
  state.clientPickerOpen = false;
  state.mobileMenuOpen = false;
  state.clientDirectorySearch = "";
}

function activeBrandSettings(presetId = state.organization?.industry_preset_id) {
  const profiles = state.settings?.brand_profiles || {};
  const brand = profiles[presetId] || {};
  const preset = state.presets.find((item) => item.id === presetId) || state.preset || {};
  const savedDisplayName = brand.display_name || state.settings?.display_name || "";
  const personalDisplayName = String(state.profile?.full_name || "").trim();
  const organizationName = String(state.organization?.name || "").trim();
  const displayName =
    savedDisplayName === personalDisplayName && organizationName && organizationName !== personalDisplayName
      ? organizationName
      : savedDisplayName;

  return {
    display_name: displayName || organizationName || "Moment:um",
    logo_text: brand.logo_text || state.settings?.logo_text || "M",
    logo_url: brand.logo_url || state.settings?.logo_url || "",
    hero_image_url: resolveHeroImageUrl(presetId, brand, preset),
    primary_color: brand.primary_color || state.settings?.primary_color || preset.accent_color || "#5B7C99",
    secondary_color: brand.secondary_color || state.settings?.secondary_color || preset.support_color || "#7FAEA3",
  };
}

function presetDefaultImageOwner(url = "") {
  const identity = imageUrlIdentity(url);
  if (!identity) return "";
  return (
    state.presets.find((preset) => preset.default_image_url && imageUrlIdentity(preset.default_image_url) === identity)?.id || ""
  );
}

function imageUrlIdentity(url = "") {
  const rawUrl = String(url || "").trim();
  if (!rawUrl) return "";

  try {
    const parsed = new URL(rawUrl, window.location.href);
    if (parsed.hostname === "images.unsplash.com") {
      return `${parsed.origin}${parsed.pathname}`.toLowerCase();
    }
    return parsed.href.toLowerCase();
  } catch (_error) {
    return rawUrl.toLowerCase();
  }
}

function customHeroImageForPreset(presetId = state.organization?.industry_preset_id) {
  const profiles = state.settings?.brand_profiles || {};
  const brand = profiles[presetId] || {};
  const rawHero = String(brand.hero_image_url || "").trim();
  if (!rawHero || presetDefaultImageOwner(rawHero)) return "";
  return rawHero;
}

function resolveHeroImageUrl(presetId, brand, preset) {
  const brandHero = String(brand?.hero_image_url || "").trim();
  if (brandHero && !presetDefaultImageOwner(brandHero)) {
    return brandHero;
  }

  const legacyHero = String(state.settings?.hero_image_url || "").trim();
  if (legacyHero && !presetDefaultImageOwner(legacyHero)) {
    return legacyHero;
  }

  return preset?.default_image_url || "";
}

function setTheme() {
  const brand = activeBrandSettings();
  const primary = brand.primary_color;
  const secondary = brand.secondary_color;
  document.documentElement.style.setProperty("--primary", primary);
  document.documentElement.style.setProperty("--secondary", secondary);
}

async function init() {
  if (!config.url || !config.anonKey) {
    renderMissingConfig();
    return;
  }

  state.supabase = createClient(config.url, config.anonKey);
  const { data } = await state.supabase.auth.getSession();
  state.session = data.session;

  state.supabase.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_IN" && state.resetToDashboardAfterAuth) {
      resetNavigationState();
      state.resetToDashboardAfterAuth = false;
    }
    state.session = session;
    loadApp();
  });

  await loadApp();
}

async function loadApp() {
  state.error = "";
  state.message = "";
  const invite = inviteParams();

  if (!state.presets.length) {
    await loadPresets();
  }

  if (!state.session) {
    renderAuth();
    return;
  }

  if (invite.hasInviteLink) {
    renderInviteSessionGate(invite);
    return;
  }

  try {
    await ensureProfile();
    if (!String(state.profile?.full_name || "").trim()) {
      renderProfileCompletion();
      return;
    }
    await acceptPendingInviteForCurrentUser();
    await loadPresets();
    await loadMemberships();
    if (!state.organization) {
      renderWorkspaceStart();
      return;
    }
    await loadWorkspaceData();
    renderApp();
  } catch (error) {
    state.error = error.message;
    renderAppShellError();
  }
}

async function acceptPendingInviteForCurrentUser() {
  const email = state.session?.user?.email || "";
  const pendingInvite = popPendingInvite(email);
  if (!pendingInvite?.code) return;

  const { data: acceptedOrgId, error } = await state.supabase.rpc("accept_invitation", {
    invite_code: pendingInvite.code,
    selected_preset_id: pendingInvite.presetId || null,
    company_name: pendingInvite.companyName || "",
  });
  if (error) {
    rememberPendingInvite(email, pendingInvite.code, pendingInvite.presetId, pendingInvite.companyName);
    throw error;
  }

  if (acceptedOrgId) rememberActiveWorkspace(acceptedOrgId);
  clearInviteParams();
}

async function ensureProfile() {
  const name = state.session.user.user_metadata?.full_name || "";
  const { data, error } = await state.supabase.rpc("ensure_profile", { user_name: name });
  if (error) throw error;
  state.profile = data;
}

async function loadPresets() {
  const { data, error } = await state.supabase
    .from("interface_presets")
    .select("*")
    .order("label");
  if (error) throw error;
  state.presets = data || [];
}

async function loadMemberships() {
  const { data, error } = await state.supabase
    .from("organization_members")
    .select("organization_id, role, organizations(id, name, industry_preset_id)")
    .eq("user_id", state.session.user.id)
    .eq("active", true);
  if (error) throw error;

  state.memberships = (data || []).sort((a, b) => {
    const roleDiff = rolePriority(a.role) - rolePriority(b.role);
    if (roleDiff) return roleDiff;
    return String(a.organizations?.name || "").localeCompare(String(b.organizations?.name || ""), "de");
  });
  const savedOrgId = state.selectedOrganizationId || window.localStorage.getItem(workspaceStorageKey()) || "";
  const selectedMembership =
    state.memberships.find((membership) => membership.organization_id === savedOrgId) || state.memberships[0] || null;
  const active = selectedMembership?.organizations || null;
  state.organization = active;
  state.selectedOrganizationId = active?.id || "";

  if (active) {
    rememberActiveWorkspace(active.id);
    const { data: settings, error: settingsError } = await state.supabase
      .from("organization_settings")
      .select("*")
      .eq("organization_id", active.id)
      .single();
    if (settingsError) throw settingsError;
    state.settings = settings;
    state.preset = state.presets.find((preset) => preset.id === active.industry_preset_id);
    setTheme();
  } else {
    rememberActiveWorkspace("");
    state.settings = null;
    state.preset = null;
  }
}

async function loadWorkspaceData() {
  const orgId = state.organization.id;
  const role = currentRole();
  const relationshipQuery = state.supabase
    .from("coach_client_relationships")
    .select("*, client:profiles!coach_client_relationships_client_id_fkey(id, full_name, email, contact_email, phone)")
    .eq("organization_id", orgId)
    .eq("active", true);

  if (role === "coach") {
    relationshipQuery.eq("coach_id", state.session.user.id);
  } else if (role === "client") {
    relationshipQuery.eq("client_id", state.session.user.id);
  }

  const groupQuery = state.supabase
    .from("client_groups")
    .select("*")
    .eq("organization_id", orgId)
    .order("name", { ascending: true });

  if (role === "coach") {
    groupQuery.eq("coach_id", state.session.user.id);
  }

  const [
    tasks,
    relationships,
    groups,
    groupMembers,
    taskBatches,
    batchRecipients,
    orgMembers,
    reflections,
    invitations,
    notes,
    templates,
    attachments,
  ] = await Promise.all([
    state.supabase
      .from("tasks")
      .select(
        "*, client:profiles!tasks_client_id_fkey(id, full_name, email, contact_email, phone), coach:profiles!tasks_coach_id_fkey(id, full_name, email, contact_email, phone), reflections(*)",
      )
      .eq("organization_id", orgId)
      .order("due_date", { ascending: true }),
    relationshipQuery,
    isCoachRole() ? groupQuery : Promise.resolve({ data: [], error: null }),
    isCoachRole()
      ? state.supabase
          .from("client_group_members")
          .select("*, client:profiles!client_group_members_client_id_fkey(id, full_name, email, contact_email, phone)")
          .eq("organization_id", orgId)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    isCoachRole()
      ? state.supabase
          .from("assignment_batches")
          .select("*")
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    isCoachRole()
      ? state.supabase
          .from("assignment_batch_recipients")
          .select("*, client:profiles!assignment_batch_recipients_client_id_fkey(id, full_name, email, contact_email, phone)")
          .eq("organization_id", orgId)
          .order("created_at", { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    state.supabase
      .from("organization_members")
      .select("user_id, role, active")
      .eq("organization_id", orgId)
      .eq("active", true),
    state.supabase
      .from("reflections")
      .select("*, tasks(title), client:profiles!reflections_client_id_fkey(full_name, email, contact_email, phone)")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false }),
    state.supabase
      .from("invitations")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false }),
    isCoachRole()
      ? state.supabase
          .from("coach_notes")
          .select("*")
          .eq("organization_id", orgId)
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    state.supabase
      .from("task_templates")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: true }),
    state.supabase
      .from("task_attachments")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: true }),
  ]);

  for (const result of [relationships, orgMembers, reflections, invitations, notes, templates]) {
    if (result.error) throw result.error;
  }
  state.groupSchemaMissing = Boolean(
    (groups.error && missingGroupSchema(groups.error)) || (groupMembers.error && missingGroupSchema(groupMembers.error)),
  );
  state.batchSchemaMissing = Boolean(
    (taskBatches.error && missingBatchSchema(taskBatches.error)) ||
      (batchRecipients.error && missingBatchSchema(batchRecipients.error)) ||
      (tasks.error && missingBatchSchema(tasks.error)),
  );
  if (tasks.error && !missingBatchSchema(tasks.error)) {
    throw tasks.error;
  }
  if ((groups.error && !missingGroupSchema(groups.error)) || (groupMembers.error && !missingGroupSchema(groupMembers.error))) {
    throw groups.error || groupMembers.error;
  }
  if (
    (taskBatches.error && !missingBatchSchema(taskBatches.error)) ||
    (batchRecipients.error && !missingBatchSchema(batchRecipients.error))
  ) {
    throw taskBatches.error || batchRecipients.error;
  }
  if (attachments.error && !missingAttachmentSchema(attachments.error)) {
    throw attachments.error;
  }

  const attachmentRows = attachments.error ? [] : attachments.data || [];
  const reflectionRows = (reflections.data || []).map((reflection) => ({
    ...reflection,
    attachments: attachmentRows.filter((attachment) => attachment.reflection_id === reflection.id),
  }));
  const taskRows = tasks.error ? [] : tasks.data || [];
  state.tasks = taskRows.map((task) => ({
    ...task,
    attachments: attachmentRows.filter((attachment) => attachment.task_id === task.id && !attachment.reflection_id),
    reflections: (task.reflections || []).map((reflection) => ({
      ...reflection,
      attachments: attachmentRows.filter((attachment) => attachment.reflection_id === reflection.id),
    })),
  }));
  state.organizationMembers = orgMembers.data || [];
  const activeWorkspaceClientIds = activeClientMemberIds();
  state.clients = (relationships.data || []).filter((relationship) => activeWorkspaceClientIds.has(relationship.client_id));
  const groupRows = state.groupSchemaMissing ? [] : groups.data || [];
  const groupMemberRows = state.groupSchemaMissing ? [] : groupMembers.data || [];
  const visibleGroupIds = new Set(groupRows.map((group) => group.id));
  state.groups = groupRows;
  state.groupMembers = groupMemberRows.filter(
    (member) => visibleGroupIds.has(member.group_id) && activeWorkspaceClientIds.has(member.client_id),
  );
  state.taskBatches = state.batchSchemaMissing ? [] : taskBatches.data || [];
  const visibleBatchIds = new Set(state.taskBatches.map((batch) => batch.id));
  state.batchRecipients = state.batchSchemaMissing
    ? []
    : (batchRecipients.data || []).filter(
        (recipient) =>
          visibleBatchIds.has(recipient.batch_id) &&
          visibleGroupIds.has(recipient.group_id) &&
          activeWorkspaceClientIds.has(recipient.client_id),
      );
  state.reflections = reflectionRows;
  state.attachments = attachmentRows;
  state.invitations = invitations.data || [];
  state.notes = notes.data || [];
  state.templates = templates.data || [];
}

function metrics() {
  const open = state.tasks.filter((task) => task.status === "open").length;
  const done = state.tasks.filter((task) => task.status === "done").length;
  const overdue = state.tasks.filter(isOverdue).length;
  const rate = state.tasks.length ? Math.round((done / state.tasks.length) * 100) : 0;
  return { open, done, overdue, rate };
}

function visibleTasks() {
  return state.tasks
    .filter((task) => {
      if (state.filter === "open") return task.status === "open";
      if (state.filter === "done") return task.status === "done";
      if (state.filter === "overdue") return isOverdue(task);
      return true;
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

function renderMissingConfig() {
  app.innerHTML = `
    <main class="auth-shell">
      <section class="auth-card stack">
        <div class="brand">
          <div class="mark"><img src="./icons/icon-192.png" alt="" /></div>
          <div>
            <strong>Moment:um MVP</strong>
            <small>Supabase noch nicht verbunden</small>
          </div>
        </div>
        <h1>Fast bereit.</h1>
        <p>Lege zuerst ein Supabase-Projekt im Free Plan an, führe <code>supabase/schema.sql</code> aus und trage URL plus Anon-Key in <code>public/supabase-config.js</code> ein.</p>
        <p class="notice">Danach kann die App lokal und später kostenlos als statische Website veröffentlicht werden.</p>
      </section>
    </main>
  `;
}

function renderAuth() {
  const invite = inviteParams();
  if (invite.hasInviteLink) {
    renderInviteRegistration(invite);
    return;
  }

  app.innerHTML = `
    <main class="auth-shell">
      <section class="auth-card stack">
        <div class="brand">
          <div class="mark"><img src="./icons/icon-192.png" alt="" /></div>
          <div>
            <strong>Moment:um</strong>
            <small>Begleitung zwischen Terminen</small>
          </div>
        </div>
        <div>
          <h1>Einloggen</h1>
          <p>Nutze deine E-Mail-Adresse und dein Passwort. Neue Accounts werden über eine Einladung angelegt.</p>
        </div>
        <form class="stack" data-action="auth">
          <label class="field">
            <span>E-Mail</span>
            <input name="email" type="email" autocomplete="email" required placeholder="name@example.com" />
          </label>
          <label class="field">
            <span>Passwort</span>
            <input name="password" type="password" autocomplete="current-password" required minlength="6" placeholder="Mindestens 6 Zeichen" />
          </label>
          ${state.error ? `<p class="error">${escapeHtml(state.error)}</p>` : ""}
          ${state.message ? `<p class="success">${escapeHtml(state.message)}</p>` : ""}
          <button class="btn primary full" name="mode" value="login">Einloggen</button>
        </form>
        <p class="muted">Noch keinen Zugang? Bitte wende dich an deinen Coach, Trainer oder Berater und lass dir einen Einladungslink mit Code senden.</p>
      </section>
    </main>
  `;
}

function renderInviteRegistration(invite) {
  const draft = invite.draft || {};
  const displayedInviteRole = invite.role || state.inviteInfo?.role || "";
  app.innerHTML = `
    <main class="auth-shell">
      <section class="auth-card stack">
        <div class="brand">
          <div class="mark"><img src="./icons/icon-192.png" alt="" /></div>
          <div>
            <strong>Einladung annehmen</strong>
            <small>Moment:um</small>
          </div>
        </div>
        <div>
          <h1>Zugang erstellen</h1>
          <p>Du wurdest eingeladen. Bitte gib den Code aus der E-Mail ein und erstelle deinen Zugang.</p>
        </div>
        <form class="stack" data-action="invite-signup">
          <label class="field">
            <span>E-Mail</span>
            <input name="email" type="email" required readonly data-invite-email value="${escapeHtml(invite.email)}" />
          </label>
          <label class="field">
            <span>Einladungscode</span>
            <input name="code" required data-invite-code placeholder="Code aus der E-Mail eingeben" value="${escapeHtml(invite.code || "")}" />
          </label>
          ${
            displayedInviteRole === "coach"
              ? `<label class="field">
                  <span>Firmenname</span>
                  <input name="company_name" required autocomplete="organization" placeholder="z. B. Praxis am Park" value="${escapeHtml(draft.company_name || "")}" />
                </label>
                <label class="field">
                  <span>Branche</span>
                  <select name="preset_id" required>${presetOptions("generic_coaching")}</select>
                </label>`
              : ""
          }
          <label class="field">
            <span>Vorname</span>
            <input name="first_name" autocomplete="given-name" required placeholder="Vorname" value="${escapeHtml(draft.first_name || "")}" />
          </label>
          <label class="field">
            <span>Nachname</span>
            <input name="last_name" autocomplete="family-name" required placeholder="Nachname" value="${escapeHtml(draft.last_name || "")}" />
          </label>
          <label class="field">
            <span>Passwort</span>
            <input name="password" type="password" autocomplete="new-password" required minlength="6" />
          </label>
          ${state.error ? `<p class="error">${escapeHtml(state.error)}</p>` : ""}
          ${state.message ? `<p class="success">${escapeHtml(state.message)}</p>` : ""}
          <button class="btn primary full">Zugang erstellen</button>
        </form>
        <form class="stack" data-action="auth">
          <input type="hidden" name="email" value="${escapeHtml(invite.email)}" />
          <label class="field">
            <span>Schon registriert? Passwort</span>
            <input name="password" type="password" autocomplete="current-password" required minlength="6" />
          </label>
          <button class="btn full" name="mode" value="login">Einloggen und Code eingeben</button>
        </form>
      </section>
    </main>
  `;
}

function renderInviteSessionGate(invite) {
  const currentEmail = state.session?.user?.email || "";
  const sameEmail = invite.email && currentEmail.toLowerCase() === invite.email.toLowerCase();

  app.innerHTML = `
    <main class="auth-shell">
      <section class="auth-card stack">
        <div class="brand">
          <div class="mark"><img src="./icons/icon-192.png" alt="" /></div>
          <div>
            <strong>Einladung öffnen</strong>
            <small>${escapeHtml(currentEmail)}</small>
          </div>
        </div>
        <div>
          <h1>Du bist bereits angemeldet</h1>
          <p>Diese Einladung ist ${invite.email ? `für ${escapeHtml(invite.email)}` : "für eine andere Person"} gedacht.</p>
        </div>
        ${
          sameEmail
            ? `<form class="stack" data-action="accept-invite">
                <label class="field">
                  <span>Einladungscode</span>
                  <input name="code" required placeholder="Code aus der E-Mail eingeben" />
                </label>
                <button class="btn primary full">Einladung annehmen</button>
              </form>`
            : `<p class="notice">Bitte melde dich zuerst ab und erstelle oder nutze den Zugang mit der eingeladenen E-Mail-Adresse.</p>`
        }
        <button class="btn full" data-action="logout-keep-invite">Abmelden und Einladung öffnen</button>
      </section>
    </main>
  `;
}

function renderWorkspaceStart() {
  const invite = inviteParams();
  const setup = isSetupMode();
  app.innerHTML = `
    <main class="auth-shell">
      <section class="auth-card stack">
        <div class="brand">
          <div class="mark"><img src="./icons/icon-192.png" alt="" /></div>
          <div>
            <strong>${setup ? "Workspace einrichten" : "Einladung erforderlich"}</strong>
            <small>${escapeHtml(state.profile?.email || "")}</small>
          </div>
        </div>
        ${
          setup
            ? `<form class="stack" data-action="create-workspace">
                <h1>Neue Organisation</h1>
                <label class="field">
                  <span>Name der Praxis, Firma oder des Teams</span>
                  <input name="name" required placeholder="z. B. Praxis am Park" />
                </label>
                <label class="field">
                  <span>Branche</span>
                  <select name="preset">${presetOptions()}</select>
                </label>
                <button class="btn primary full">Workspace erstellen</button>
              </form>`
            : `<div class="stack">
                <h1>Du bist noch keiner Organisation zugeordnet</h1>
                <p class="muted">Diese E-Mail-Adresse ist noch keinem Workspace zugeordnet. Bitte wende dich an deinen Coach, Trainer oder Berater und lass dir einen Einladungslink mit Code senden.</p>
              </div>`
        }
        <button class="btn subtle" data-action="logout">Abmelden</button>
      </section>
    </main>
  `;
}

function renderProfileCompletion() {
  app.innerHTML = `
    <main class="auth-shell">
      <section class="auth-card stack">
        <div class="brand">
          <div class="mark"><img src="./icons/icon-192.png" alt="" /></div>
          <div>
            <strong>Profil ergänzen</strong>
            <small>${escapeHtml(state.profile?.email || "")}</small>
          </div>
        </div>
        <div>
          <h1>Wie heißt du?</h1>
          <p>Bitte gib Vorname und Nachname ein, damit dein Name in der App sauber angezeigt wird.</p>
        </div>
        <form class="stack" data-action="update-profile-name">
          <label class="field">
            <span>Vorname</span>
            <input name="first_name" autocomplete="given-name" required placeholder="Vorname" />
          </label>
          <label class="field">
            <span>Nachname</span>
            <input name="last_name" autocomplete="family-name" required placeholder="Nachname" />
          </label>
          ${state.error ? `<p class="error">${escapeHtml(state.error)}</p>` : ""}
          <button class="btn primary full">Speichern</button>
        </form>
        <button class="btn subtle" data-action="logout">Abmelden</button>
      </section>
    </main>
  `;
}

function renderAppShellError() {
  app.innerHTML = `
    <main class="auth-shell">
      <section class="auth-card stack">
        <h1>Etwas hakt noch</h1>
        <p class="error">${escapeHtml(state.error)}</p>
        <button class="btn primary" data-action="reload">Neu laden</button>
        <button class="btn subtle" data-action="logout">Abmelden</button>
      </section>
    </main>
  `;
}

function renderApp() {
  const role = currentRole();
  app.innerHTML = `
    <div class="app-shell ${state.mobileMenuOpen ? "menu-open" : ""}">
      ${renderMobileHeader()}
      <button class="menu-backdrop" data-close-menu aria-label="Menü schließen"></button>
      ${renderSidebar(role)}
      <main class="content">
        ${renderTopbar(role)}
        ${state.message ? `<p class="notice">${escapeHtml(state.message)}</p>` : ""}
        ${state.error ? `<p class="error">${escapeHtml(state.error)}</p>` : ""}
      ${renderView()}
      </main>
      ${state.modalTask ? renderReflectionModal() : ""}
      ${state.readerModal ? renderReaderModal() : ""}
      ${state.taskComposerOpen ? renderTaskComposerModal() : ""}
      ${state.groupEditor ? renderGroupModal() : ""}
      ${state.batchModalId ? renderBatchModal() : ""}
      ${state.inviteModalId ? renderInviteModal() : ""}
      ${state.reminderModalClientId ? renderReminderModal() : ""}
      ${state.toast ? renderToast() : ""}
    </div>
  `;
}

function renderToast() {
  return `<div class="toast" role="status" aria-live="polite">${escapeHtml(state.toast.text)}</div>`;
}

function renderMobileHeader() {
  const brand = activeBrandSettings();
  const logo = brand.logo_text;
  const logoUrl = brand.logo_url;

  return `
    <header class="mobile-header">
      <div class="mobile-brand-stack">
        <div class="brand compact">
          <div class="mark">${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="" />` : escapeHtml(logo)}</div>
          <div>
            <strong>${escapeHtml(brand.display_name)}</strong>
            <small>${escapeHtml(navTitle())}</small>
          </div>
        </div>
        ${renderWorkspaceSwitcher("mobile")}
      </div>
      <button class="icon-btn menu-toggle" data-toggle-menu aria-label="Menü öffnen" aria-expanded="${state.mobileMenuOpen ? "true" : "false"}">
        <span></span>
        <span></span>
        <span></span>
      </button>
    </header>
  `;
}

function renderSidebar(role) {
  const brand = activeBrandSettings();
  const logo = brand.logo_text;
  const logoUrl = brand.logo_url;
  const name = brand.display_name;
  const navItems = [
    ["dashboard", "Dashboard"],
    ["tasks", "Aufgaben"],
    isCoachRole() ? ["clients", state.preset?.client_label || "Clients"] : null,
    isCoachRole() ? ["groups", "Gruppen"] : null,
    state.view === "clientProfile" ? ["clientProfile", "Profil"] : null,
    ["myProfile", "Mein Profil"],
    isCoachRole() ? ["reminders", "Erinnerungen"] : null,
    role === "owner" ? ["settings", "Branding"] : null,
  ].filter(Boolean);

  return `
    <aside class="sidebar">
      <div class="sidebar-head">
        <div class="brand">
          <div class="mark">${logoUrl ? `<img src="${escapeHtml(logoUrl)}" alt="" />` : escapeHtml(logo)}</div>
          <div>
            <strong>${escapeHtml(name)}</strong>
            <small>${escapeHtml(state.preset?.label || "MVP")}</small>
          </div>
        </div>
        <button class="icon-btn sidebar-close" data-close-menu aria-label="Menü schließen">×</button>
      </div>
      ${renderWorkspaceSwitcher("sidebar")}
      <nav class="nav">
        ${navItems
          .map(
            ([id, label]) =>
              `<button class="${state.view === id ? "active" : ""}" data-view="${id}">${escapeHtml(label)}</button>`,
          )
          .join("")}
      </nav>
      <div class="sidebar-footer">
        <small class="muted">${escapeHtml(personName(state.profile, state.profile?.email || "User"))} · ${escapeHtml(role)}</small>
        <button class="btn" data-action="logout">Abmelden</button>
      </div>
    </aside>
  `;
}

function renderWorkspaceSwitcher(variant = "sidebar") {
  if (state.memberships.length <= 1) return "";
  return `
    <label class="workspace-switcher ${variant}">
      <span>Workspace</span>
      <select data-workspace-switch>
        ${state.memberships
          .map((membership) => {
            const org = membership.organizations || {};
            const selected = org.id === state.organization?.id ? "selected" : "";
            return `<option value="${org.id}" ${selected}>${escapeHtml(org.name || "Workspace")} · ${escapeHtml(membership.role)}</option>`;
          })
          .join("")}
      </select>
    </label>
  `;
}

function renderTopbar(role) {
  const clientLabel = state.preset?.client_label || "Clients";
  const practitioner = state.preset?.practitioner_label || "Coach";
  const subtitle = isCoachRole()
    ? `${practitioner}-Ansicht fuer ${clientLabel}, Fortschritt und Reflexionen.`
    : `Deine offenen Aufgaben und Reflexionen.`;
  const imageUrl = activeBrandSettings().hero_image_url || state.preset?.default_image_url || "";

  return `
    <header class="topbar" ${imageUrl ? `style="--hero-image:url('${escapeHtml(imageUrl)}')"` : ""}>
      <div>
        <h1>${escapeHtml(state.view === "dashboard" ? "Dashboard" : navTitle())}</h1>
        <p>${escapeHtml(subtitle)}</p>
      </div>
      <button class="btn" data-action="reload">Aktualisieren</button>
    </header>
  `;
}

function navTitle() {
  const labels = {
    tasks: "Aufgaben",
    clients: state.preset?.client_label || "Clients",
    groups: "Gruppen",
    clientProfile: "Profil",
    myProfile: "Mein Profil",
    reminders: "Erinnerungen",
    settings: "Branding",
  };
  return labels[state.view] || "Dashboard";
}

function renderView() {
  if (state.view === "tasks") return renderTasks();
  if (state.view === "clients") return renderClients();
  if (state.view === "groups") return renderGroups();
  if (state.view === "clientProfile") return renderClientProfile();
  if (state.view === "myProfile") return renderMyProfile();
  if (state.view === "reminders") return renderReminders();
  if (state.view === "settings") return renderSettings();
  return renderDashboard();
}

function renderDashboard() {
  const data = metrics();
  return `
    <section class="grid metrics metric-strip">
      ${metricCard("Offen", data.open)}
      ${metricCard("Überfällig", data.overdue)}
      ${metricCard("Erledigt", data.done)}
      ${metricCard("Umsetzung", `${data.rate}%`)}
    </section>
    <section class="grid two dashboard-grid">
      ${renderTasksPanel(false)}
      <div class="panel dashboard-reflections">
        <div class="toolbar">
          <h2>Neueste Reflexionen</h2>
        </div>
        <div class="task-list">
          ${
            state.reflections.length
              ? state.reflections.slice(0, 6).map(renderReflection).join("")
              : `<p class="muted">Noch keine Reflexionen vorhanden.</p>`
          }
        </div>
      </div>
    </section>
  `;
}

function metricCard(label, value) {
  return `
    <article class="panel metric">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </article>
  `;
}

function renderTasks() {
  return renderTasksPanel(true);
}

function renderTasksPanel(withForm) {
  if (withForm && isCoachRole()) {
    return `
      <section class="panel task-panel">
        <div class="toolbar tasks-toolbar">
          <h2>Aufgaben</h2>
          <div class="task-toolbar-actions">
            <button class="btn primary" data-action="open-task-composer">Neue Aufgabe</button>
            <div class="segmented">
              ${filterButton("all", "Alle")}
              ${filterButton("open", "Offen")}
              ${filterButton("overdue", "Überfällig")}
              ${filterButton("done", "Erledigt")}
            </div>
          </div>
        </div>
        <div class="task-list">
          ${visibleTasks().length ? visibleTasks().map(renderTask).join("") : `<p class="muted">Keine passenden Einträge.</p>`}
        </div>
      </section>
    `;
  }

  return `
    <section class="panel task-panel">
      <div class="toolbar">
        <h2>Aufgaben</h2>
        <div class="segmented">
          ${filterButton("all", "Alle")}
          ${filterButton("open", "Offen")}
          ${filterButton("overdue", "Überfällig")}
          ${filterButton("done", "Erledigt")}
        </div>
      </div>
      <div class="grid">
        <div class="task-list">
          ${visibleTasks().length ? visibleTasks().map(renderTask).join("") : `<p class="muted">Keine passenden Einträge.</p>`}
        </div>
      </div>
    </section>
  `;
}

function renderTaskComposerModal() {
  return `
    <div class="modal" data-task-composer-backdrop>
      ${renderTaskForm("modal-card task-composer-modal")}
    </div>
  `;
}

function filterButton(id, label) {
  return `<button class="${state.filter === id ? "active" : ""}" data-filter="${id}">${escapeHtml(label)}</button>`;
}

function renderTask(task) {
  const person = isCoachRole()
    ? personName(task.client, "Client")
    : personName(task.coach, "Coach");
  const status = task.status === "done" ? "Erledigt" : isOverdue(task) ? "Überfällig" : "Offen";
  const statusClass = task.status === "done" ? "done" : isOverdue(task) ? "overdue" : "";
  return `
    <article class="task-row readable-row" data-open-reader="task:${task.id}" role="button" tabindex="0">
      <header>
        <div>
          <h3>${escapeHtml(task.title)}</h3>
          <small class="muted">${escapeHtml(person)}</small>
        </div>
        <span class="chip ${statusClass}">${escapeHtml(status)}</span>
      </header>
      ${renderRichPreview(task.description, "Keine Beschreibung", "task-description")}
      ${renderAttachmentList(task.attachments)}
      <div class="task-meta chips">
        <span class="chip">Fällig ${formatDate(task.due_date)}</span>
        ${task.reflections?.length ? `<span class="chip done">Reflexion vorhanden</span>` : ""}
      </div>
      ${
        !isCoachRole() && task.status === "open"
          ? `<button class="btn primary" data-complete="${task.id}">Abschließen & reflektieren</button>`
          : ""
      }
    </article>
  `;
}

function renderTaskForm(className = "panel") {
  const recipientCount = taskRecipientCount();
  return `
    <form class="${escapeHtml(className)} form-grid task-composer" data-action="create-task">
      <div class="task-composer-head">
        <div>
          <span class="section-kicker">Neue Aufgabe</span>
          <h2>Aufgabe vorbereiten</h2>
        </div>
        <div class="task-composer-head-actions">
          <span class="recipient-count-pill" data-task-recipient-count>${recipientCount} Empfänger</span>
          ${state.taskComposerOpen ? `<button class="icon-btn" type="button" data-action="close-task-composer" aria-label="Aufgabe schließen">×</button>` : ""}
        </div>
      </div>

      <section class="task-compose-section">
        <div class="task-section-title">
          <span>1</span>
          <div>
            <h3>Empfänger</h3>
            <p>Wähle einzelne Personen, Gruppen oder beides. Doppelte Empfänger werden automatisch zusammengeführt.</p>
          </div>
        </div>
        ${renderClientPicker()}
        ${renderTaskGroupPicker()}
      </section>

      <section class="task-compose-section">
        <div class="task-section-title">
          <span>2</span>
          <div>
            <h3>Inhalt</h3>
            <p>Starte optional mit einem Template und passe Titel sowie Beschreibung an.</p>
          </div>
        </div>
        <label class="field compact-field">
          <span>Template verwenden</span>
          <select name="template_id" data-template-select>
            <option value="">Ohne Template</option>
            ${state.templates
              .filter((template) => template.preset_id === state.organization.industry_preset_id)
              .map(
                (template) =>
                  `<option value="${template.id}" data-title="${escapeHtml(template.title)}" data-description="${escapeHtml(richTextToHtml(template.description))}">${escapeHtml(template.title)}</option>`,
              )
              .join("")}
          </select>
        </label>
        <label class="field">
          <span>Titel</span>
          <input name="title" data-task-title required placeholder="${escapeHtml(taskTitlePlaceholder())}" />
        </label>
        ${renderRichTextField("description", "Beschreibung", "", {
          placeholder: "Was soll umgesetzt werden?",
        }).replace("data-rich-editor", "data-rich-editor data-task-description")}
      </section>

      <section class="task-compose-section">
        <div class="task-section-title">
          <span>3</span>
          <div>
            <h3>Details</h3>
            <p>Lege Fälligkeit und optionale Unterlagen fest.</p>
          </div>
        </div>
        <label class="field">
          <span>Fälligkeitsdatum</span>
          <input name="due_date" type="date" required value="${todayIso}" />
        </label>
        ${renderFileField("Dateien zur Aufgabe")}
      </section>

      <div class="task-create-footer">
        <div>
          <strong data-task-recipient-total>${recipientCount} Empfänger</strong>
          <span data-task-recipient-help>${recipientCount ? "Bereit zum Erstellen, sobald Titel und Datum gesetzt sind." : "Wähle mindestens eine Person oder Gruppe."}</span>
          ${taskComposerNotice()}
        </div>
        <button class="btn primary" ${state.clients.length ? "" : "disabled"}>Aufgabe erstellen</button>
      </div>
      <p class="form-submit-error" data-submit-error ${state.taskComposerOpen && state.error ? "" : "hidden"}>${state.taskComposerOpen && state.error ? escapeHtml(state.error) : ""}</p>
      ${state.clients.length ? "" : `<p class="muted">Lege zuerst eine Einladung fuer einen Client an.</p>`}
    </form>
  `;
}

function taskRecipientCount() {
  const groupClientIds = state.selectedTaskGroupIds.flatMap((groupId) => groupMembers(groupId).map((member) => member.client_id));
  return new Set([...state.selectedTaskClientIds, ...groupClientIds]).size;
}

function taskComposerNotice() {
  if (!String(state.message || "").startsWith("Aufgabe wurde")) return "";
  return `<span class="task-create-success">${escapeHtml(state.message)}</span>`;
}

function taskTitlePlaceholder() {
  return (
    {
      psychotherapy: "z. B. Achtsamkeitsübung 3x diese Woche",
      physiotherapy: "z. B. Heimübung Knie-Stabilität",
      football: "z. B. Techniktraining Ballkontrolle",
      martial_arts: "z. B. Technikdrill Grundstellung",
      dog_training: "z. B. Rückruf in ruhiger Umgebung üben",
      nutrition: "z. B. Trinkroutine für drei Tage testen",
      generic_coaching: "z. B. Wochenfokus konkret umsetzen",
    }[state.organization?.industry_preset_id] || "z. B. Wochenfokus konkret umsetzen"
  );
}

function refreshTaskRecipientSummary() {
  const count = taskRecipientCount();
  document.querySelectorAll("[data-task-recipient-count], [data-task-recipient-total]").forEach((item) => {
    item.textContent = `${count} Empfänger`;
  });
  const help = document.querySelector("[data-task-recipient-help]");
  if (help) {
    help.textContent = count
      ? "Bereit zum Erstellen, sobald Titel und Datum gesetzt sind."
      : "Wähle mindestens eine Person oder Gruppe.";
  }
}

function renderClientPicker() {
  const query = state.clientSearch.trim().toLowerCase();
  const selected = state.clients.filter((item) => state.selectedTaskClientIds.includes(item.client_id));
  const results = state.clients
    .filter((item) => !state.selectedTaskClientIds.includes(item.client_id))
    .filter((item) => {
      if (!query) return true;
      return `${personName(item.client, "")} ${personEmail(item.client)}`.toLowerCase().includes(query);
    })
    .slice(0, 8);
  const hiddenClientInputs = selected
    .map((item) => `<input type="hidden" name="client_ids" value="${item.client_id}" />`)
    .join("");

  return `
    <fieldset class="field client-picker">
      <legend>${escapeHtml(state.preset?.client_label || "Client")}</legend>
      ${
        selected.length
          ? `<div class="selected-client-chips">
              ${selected.map((item) => `
              <span class="selected-client-chip">
                ${escapeHtml(personName(item.client, item.client_id))}
                <button type="button" data-unselect-task-client="${item.client_id}">×</button>
              </span>
            `).join("")}
            </div>`
          : ""
      }
      ${hiddenClientInputs}
      <div class="client-search-box">
        <input data-client-search value="${escapeHtml(state.clientSearch)}" placeholder="Client suchen oder auswählen..." autocomplete="off" />
        <div class="client-search-results ${state.clientPickerOpen ? "is-open" : ""}">
          ${
            results.length
              ? results.map((item) => `
                <button type="button" class="client-result" data-select-task-client="${item.client_id}">
                  <strong>${escapeHtml(personName(item.client, item.client_id))}</strong>
                  <small>${escapeHtml(personEmail(item.client))}</small>
                </button>
              `).join("")
              : `<p class="client-empty">Keine passenden Clients gefunden.</p>`
          }
        </div>
      </div>
    </fieldset>
  `;
}

function renderTaskGroupPicker() {
  if (!state.groups.length) {
    return `<p class="muted compact-help">Noch keine Gruppen angelegt. Du kannst Gruppen in der Rubrik Gruppen erstellen.</p>`;
  }

  const selectedGroups = state.groups.filter((group) => state.selectedTaskGroupIds.includes(group.id));
  const availableGroups = state.groups.filter((group) => !state.selectedTaskGroupIds.includes(group.id));
  const hiddenGroupInputs = selectedGroups
    .map((group) => `<input type="hidden" name="group_ids" value="${group.id}" />`)
    .join("");

  return `
    <div class="group-task-picker" data-task-group-picker>
      <div class="selected-client-chips group-selection-chips">
        ${
          selectedGroups.length
            ? selectedGroups
                .map((group) => {
                  const count = groupMembers(group.id).length;
                  return `
                    <span class="selected-client-chip">
                      ${escapeHtml(group.name)} · ${count}
                      <button type="button" data-unselect-task-group="${group.id}">×</button>
                    </span>
                  `;
                })
                .join("")
            : `<span class="client-picker-hint">Oder</span>`
        }
      </div>
      ${hiddenGroupInputs}
      <label class="field">
        <span>Gruppe auswählen</span>
        <select name="group_ids" data-task-group-select ${availableGroups.length ? "" : "disabled"}>
          <option value="">Gruppe auswählen</option>
          ${availableGroups
            .map((group) => {
              const count = groupMembers(group.id).length;
              const disabled = count < 2 ? "disabled" : "";
              const suffix = count < 2 ? " · mindestens 2 nötig" : ` · ${count} Personen`;
              return `<option value="${group.id}" ${disabled}>${escapeHtml(group.name)}${escapeHtml(suffix)}</option>`;
            })
            .join("")}
        </select>
      </label>
    </div>
  `;
}

function refreshTaskGroupPicker() {
  const picker = document.querySelector("[data-task-group-picker]");
  if (picker) picker.outerHTML = renderTaskGroupPicker();
}

function refreshClientPicker(options = {}) {
  const picker = document.querySelector(".client-picker");
  if (!picker) return;
  picker.outerHTML = renderClientPicker();
  if (options.focus !== false) {
    const nextInput = document.querySelector("[data-client-search]");
    if (nextInput) {
      nextInput.focus();
      nextInput.setSelectionRange(nextInput.value.length, nextInput.value.length);
    }
  }
}

function renderReflection(reflection) {
  return `
    <article class="reflection-row readable-row" data-open-reader="reflection:${reflection.id}" role="button" tabindex="0">
      <div class="reflection-dot"></div>
      <div>
        <div class="reflection-head">
          <strong>${escapeHtml(reflection.tasks?.title || "Reflexion")}</strong>
          ${reflection.mood ? `<span class="chip">${escapeHtml(reflection.mood)}</span>` : ""}
        </div>
        ${renderRichPreview(reflection.text, "Keine Reflexion", "reflection-text")}
        ${renderAttachmentList(reflection.attachments)}
        <small class="muted">${escapeHtml(personName(reflection.client, "Client"))}</small>
      </div>
    </article>
  `;
}

function renderClients() {
  const openInvites = state.invitations.filter((invite) => !invite.accepted_at);

  return `
    <section class="stack">
      <div class="grid two client-management-grid">
        ${renderInviteForm()}
        ${renderClientDirectory()}
      </div>
      ${renderOpenInvites(openInvites, true)}
    </section>
  `;
}

function renderClientDirectory() {
  const clientLabel = state.preset?.client_label || "Clients";
  const query = state.clientDirectorySearch.trim().toLowerCase();
  const rows = state.clients
    .map((item) => {
      const tasks = state.tasks.filter((task) => task.client_id === item.client_id);
      const open = tasks.filter((task) => task.status === "open" && !isOverdue(task)).length;
      const overdue = tasks.filter(isOverdue).length;
      const done = tasks.filter((task) => task.status === "done").length;
      const name = personName(item.client, "Client");
      const email = personEmail(item.client);
      return { ...item, tasks, open, overdue, done, name, email };
    })
    .filter((item) => {
      if (!query) return true;
      return `${item.name} ${item.email}`.toLowerCase().includes(query);
    })
    .sort((a, b) => a.name.localeCompare(b.name, "de"));

  return `
    <section class="panel client-directory-panel" data-client-directory>
      <div class="toolbar client-directory-head">
        <div>
          <h2>${escapeHtml(clientLabel)}</h2>
          <p class="muted">${state.clients.length} verbunden${query ? ` · ${rows.length} Treffer` : ""}</p>
        </div>
      </div>
      <label class="client-directory-search">
        <span>Suchen</span>
        <input data-client-directory-search value="${escapeHtml(state.clientDirectorySearch)}" placeholder="Name oder E-Mail" />
      </label>
      <div class="client-list compact-directory">
        ${
          rows.length
            ? rows.map((item) => `
              <article class="client-row compact-client-row">
                <div class="client-identity">
                  <strong>${escapeHtml(item.name)}</strong>
                  <p class="muted">${escapeHtml(item.email)}</p>
                </div>
                <div class="client-row-meta">
                  <span class="mini-stat">${item.tasks.length} gesamt</span>
                  <span class="mini-stat">${item.open} offen</span>
                  ${item.overdue ? `<span class="mini-stat overdue">${item.overdue} überfällig</span>` : ""}
                  <span class="mini-stat done">${item.done} erledigt</span>
                </div>
                <div class="client-row-actions">
                  <button class="btn small" data-client-profile="${item.client_id}">Profil</button>
                  <button class="btn small danger subtle-danger" data-remove-client="${item.client_id}" data-client-name="${escapeHtml(item.name)}">Entfernen</button>
                </div>
              </article>
            `).join("")
            : `<p class="muted">Keine passenden Personen gefunden.</p>`
        }
      </div>
    </section>
  `;
}

function refreshClientDirectory() {
  const directory = document.querySelector("[data-client-directory]");
  if (!directory) return;
  directory.outerHTML = renderClientDirectory();
  const input = document.querySelector("[data-client-directory-search]");
  if (input) {
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  }
}

function renderGroups() {
  if (state.groupSchemaMissing) {
    return `
      <section class="empty-card stack">
        <h2>Gruppen sind vorbereitet</h2>
        <p>Bitte führe zuerst die aktualisierte Datei <code>supabase/schema.sql</code> im Supabase SQL Editor aus. Danach kannst du Gruppen erstellen und Aufgaben an Gruppen senden.</p>
      </section>
    `;
  }

  return `
    <section class="grid two group-management-grid">
      <form class="panel form-grid" data-action="create-group">
        <h2>Gruppe erstellen</h2>
        <p class="muted">Gruppen helfen dir, dieselbe Aufgabe mehreren Personen gleichzeitig zu senden. Jede Gruppe braucht mindestens 2 Mitglieder.</p>
        <label class="field">
          <span>Gruppenname</span>
          <input name="name" required placeholder="z. B. U12 Technikgruppe" />
        </label>
        <button class="btn primary">Gruppe erstellen</button>
      </form>
      <section class="panel">
        <div class="toolbar">
          <div>
            <h2>Gruppen</h2>
            <p class="muted">${state.groups.length} angelegt</p>
          </div>
        </div>
        <div class="group-list">
          ${state.groups.length ? state.groups.map(renderGroupCard).join("") : `<p class="muted">Noch keine Gruppen angelegt.</p>`}
        </div>
      </section>
    </section>
  `;
}

function groupMembers(groupId) {
  return state.groupMembers.filter((member) => member.group_id === groupId);
}

function renderGroupCard(group) {
  const members = groupMembers(group.id);
  const batches = groupBatches(group.id).slice(0, 4);

  return `
    <article class="group-card compact-group-card">
      <div class="compact-group-main">
        <div>
          <h3>${escapeHtml(group.name)}</h3>
          <p class="muted">${members.length} Person${members.length === 1 ? "" : "en"}</p>
          ${members.length < 2 ? `<small class="error">Mindestens 2 Personen erforderlich</small>` : ""}
        </div>
        <div class="compact-group-actions">
          <button class="btn small" data-edit-group="${group.id}">Bearbeiten</button>
          <button class="btn small subtle-danger" data-delete-group="${group.id}" data-group-name="${escapeHtml(group.name)}">Löschen</button>
        </div>
      </div>
      <div class="group-batch-list">
        <div class="compact-section-head">
          <strong>Aktuelle Gruppenaufgaben</strong>
          ${state.batchSchemaMissing ? `<small class="muted">SQL-Update nötig</small>` : ""}
        </div>
        ${
          state.batchSchemaMissing
            ? `<p class="muted">Bitte führe die aktualisierte Datei <code>supabase/schema.sql</code> aus, damit neue Gruppenaufgaben hier mit Fortschritt angezeigt werden.</p>`
            : batches.length
              ? batches.map((batch) => renderGroupBatchRow(group.id, batch)).join("")
              : `<p class="muted">Noch keine Gruppenaufgaben für diese Gruppe.</p>`
        }
      </div>
    </article>
  `;
}

function groupBatches(groupId) {
  const batchIds = new Set(state.batchRecipients.filter((recipient) => recipient.group_id === groupId).map((recipient) => recipient.batch_id));
  return state.taskBatches.filter((batch) => batchIds.has(batch.id));
}

function groupBatchRecipients(groupId, batchId) {
  return state.batchRecipients.filter((recipient) => recipient.group_id === groupId && recipient.batch_id === batchId);
}

function taskForBatchClient(batchId, clientId) {
  return state.tasks.find((task) => task.assignment_batch_id === batchId && task.client_id === clientId);
}

function groupBatchStats(groupId, batchId) {
  const recipients = groupBatchRecipients(groupId, batchId);
  const rows = recipients.map((recipient) => ({
    recipient,
    task: taskForBatchClient(batchId, recipient.client_id),
  }));
  const done = rows.filter((row) => row.task?.status === "done").length;
  const overdue = rows.filter((row) => row.task && isOverdue(row.task)).length;
  const open = rows.filter((row) => row.task?.status === "open" && !isOverdue(row.task)).length;
  const total = rows.length;
  const rate = total ? Math.round((done / total) * 100) : 0;
  return { rows, done, overdue, open, total, rate };
}

function renderGroupBatchRow(groupId, batch) {
  const stats = groupBatchStats(groupId, batch.id);
  return `
    <button class="group-batch-row" type="button" data-open-batch="${batch.id}" data-batch-group="${groupId}">
      <span>
        <strong>${escapeHtml(batch.title)}</strong>
        <small>Fällig ${formatDate(batch.due_date)}</small>
      </span>
      <span class="group-batch-progress">
        <span>${stats.done}/${stats.total} erledigt · ${stats.rate}%</span>
        <i style="--progress:${stats.rate}%"></i>
      </span>
      <span class="group-batch-mini">
        ${stats.open} offen · ${stats.overdue} überfällig
      </span>
    </button>
  `;
}

function openGroupEditor(groupId = "", name = "") {
  const group = state.groups.find((item) => item.id === groupId);
  state.groupEditor = {
    groupId: group?.id || "",
    name: group?.name || name,
    selectedIds: group ? groupMembers(group.id).map((member) => member.client_id) : [],
    search: "",
  };
  renderApp();
}

function groupEditorRows() {
  const query = String(state.groupEditor?.search || "").trim().toLowerCase();
  return state.clients
    .map((item) => ({
      id: item.client_id,
      name: personName(item.client, item.client_id),
      email: personEmail(item.client),
    }))
    .filter((item) => {
      if (!query) return true;
      return `${item.name} ${item.email}`.toLowerCase().includes(query);
    })
    .sort((a, b) => a.name.localeCompare(b.name, "de"));
}

function renderGroupModal() {
  return `
    <div class="modal" data-group-backdrop>
      ${renderGroupModalCard()}
    </div>
  `;
}

function renderBatchModal() {
  const [batchId, groupId] = String(state.batchModalId || "").split(":");
  const batch = state.taskBatches.find((item) => item.id === batchId);
  const group = state.groups.find((item) => item.id === groupId);
  if (!batch || !group) return "";
  const stats = groupBatchStats(groupId, batchId);
  const doneRows = stats.rows.filter((row) => row.task?.status === "done");
  const overdueRows = stats.rows.filter((row) => row.task && isOverdue(row.task));
  const openRows = stats.rows.filter((row) => row.task?.status === "open" && !isOverdue(row.task));

  return `
    <div class="modal" data-batch-backdrop>
      <section class="panel modal-card batch-modal-card" role="dialog" aria-modal="true" aria-label="${escapeHtml(batch.title)}">
        <header class="reader-head">
          <div>
            <span class="reader-eyebrow">${escapeHtml(group.name)}</span>
            <h2>${escapeHtml(batch.title)}</h2>
          </div>
          <button class="btn small" data-action="close-batch-modal">Schließen</button>
        </header>
        <div class="batch-summary">
          <article>
            <span>Erledigt</span>
            <strong>${stats.done}/${stats.total}</strong>
          </article>
          <article>
            <span>Offen</span>
            <strong>${stats.open}</strong>
          </article>
          <article>
            <span>Überfällig</span>
            <strong>${stats.overdue}</strong>
          </article>
          <article>
            <span>Umsetzung</span>
            <strong>${stats.rate}%</strong>
          </article>
        </div>
        <div class="batch-modal-body">
          ${renderBatchPersonSection("Überfällig", overdueRows, "overdue")}
          ${renderBatchPersonSection("Offen", openRows, "")}
          ${renderBatchPersonSection("Erledigt", doneRows, "done")}
        </div>
      </section>
    </div>
  `;
}

function renderBatchPersonSection(title, rows, statusClass) {
  return `
    <section class="batch-person-section">
      <h3>${escapeHtml(title)} <span>${rows.length}</span></h3>
      <div class="batch-person-list">
        ${
          rows.length
            ? rows.map((row) => renderBatchPersonRow(row, statusClass)).join("")
            : `<p class="muted">Keine Einträge.</p>`
        }
      </div>
    </section>
  `;
}

function renderBatchPersonRow(row, statusClass) {
  const person = row.recipient.client || row.task?.client || {};
  const task = row.task;
  const reflectionCount = task?.reflections?.length || 0;
  return `
    <article class="batch-person-row ${statusClass}">
      <div>
        <strong>${escapeHtml(personName(person, row.recipient.client_id))}</strong>
        <small>${escapeHtml(personEmail(person))}</small>
      </div>
      <div class="batch-person-meta">
        ${task?.completed_at ? `<span class="chip done">Erledigt ${formatDate(task.completed_at.slice(0, 10))}</span>` : ""}
        ${reflectionCount ? `<span class="chip done">Reflexion vorhanden</span>` : `<span class="chip">Keine Reflexion</span>`}
        ${task ? `<button class="btn small" data-open-reader="task:${task.id}">Aufgabe öffnen</button>` : ""}
      </div>
    </article>
  `;
}

function renderGroupModalCard() {
  const editor = state.groupEditor || { groupId: "", name: "", selectedIds: [], search: "" };
  const rows = groupEditorRows();
  const selected = new Set(editor.selectedIds);
  const visibleIds = rows.map((item) => item.id);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const selectedCount = selected.size;

  return `
    <form class="panel modal-card group-modal-card" data-group-modal-card data-action="save-group">
      <div class="reader-head">
        <div>
          <span class="reader-eyebrow">${editor.groupId ? "Gruppe bearbeiten" : "Neue Gruppe"}</span>
          <h2>${escapeHtml(editor.name)}</h2>
        </div>
        <button class="btn small" type="button" data-action="close-group-modal">Schließen</button>
      </div>
      <input type="hidden" name="group_id" value="${escapeHtml(editor.groupId)}" />
      <input type="hidden" name="name" value="${escapeHtml(editor.name)}" />
      <div class="group-modal-body">
        <label class="client-directory-search group-member-search">
          <span>Suchen</span>
          <input data-group-member-search value="${escapeHtml(editor.search)}" placeholder="Name oder E-Mail" autocomplete="off" />
        </label>
        <div class="group-select-toolbar">
          <button class="btn small" type="button" data-toggle-all-group-members>
            ${allVisibleSelected ? "Sichtbare abwählen" : "Alle auswählen"}
          </button>
          <span class="muted">${selectedCount} ausgewählt · mindestens 2 nötig</span>
        </div>
        <div class="group-member-list">
          ${
            rows.length
              ? rows
                  .map(
                    (item) => `
                      <label class="group-member-row">
                        <input type="checkbox" name="group_member_ids" value="${item.id}" data-group-member-checkbox ${selected.has(item.id) ? "checked" : ""} />
                        <span>
                          <strong>${escapeHtml(item.name)}</strong>
                          <small>${escapeHtml(item.email)}</small>
                        </span>
                      </label>
                    `,
                  )
                  .join("")
              : `<p class="muted">Keine passenden Personen gefunden.</p>`
          }
        </div>
        ${state.clients.length < 2 ? `<p class="error">Für eine Gruppe brauchst du mindestens zwei aktive Personen.</p>` : ""}
      </div>
      <div class="modal-actions">
        <button class="btn subtle" type="button" data-action="close-group-modal">Abbrechen</button>
        <button class="btn primary" ${selectedCount >= 2 ? "" : "disabled"}>Änderungen speichern (${selectedCount})</button>
      </div>
    </form>
  `;
}

function refreshGroupModal(options = {}) {
  const card = document.querySelector("[data-group-modal-card]");
  if (!card) return;
  card.outerHTML = renderGroupModalCard();
  if (options.focusSearch !== false) {
    const input = document.querySelector("[data-group-member-search]");
    if (input) {
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
  }
}

function renderMyProfile() {
  return `
    <section class="grid two">
      ${renderProfileForm(state.profile, "Eigene Stammdaten", true)}
      <aside class="panel stack">
        <h2>Hinweis zur E-Mail</h2>
        <p class="muted">Wenn du deine eigene Login-E-Mail änderst, kann Supabase je nach Einstellung eine Bestätigung per E-Mail verlangen. Deine Kontakt-E-Mail wird sofort im Profil gespeichert.</p>
      </aside>
    </section>
  `;
}

function renderProfileForm(profile, title, isSelf = false) {
  const names = splitName(profile?.full_name || "");
  return `
    <form class="panel form-grid" data-action="update-profile-contact">
      <h2>${escapeHtml(title)}</h2>
      <input type="hidden" name="user_id" value="${escapeHtml(profile?.id || "")}" />
      <input type="hidden" name="is_self" value="${isSelf ? "true" : "false"}" />
      <label class="field">
        <span>Vorname</span>
        <input name="first_name" required value="${escapeHtml(names.firstName)}" />
      </label>
      <label class="field">
        <span>Nachname</span>
        <input name="last_name" required value="${escapeHtml(names.lastName)}" />
      </label>
      <label class="field">
        <span>E-Mail</span>
        <input name="contact_email" type="email" required value="${escapeHtml(personEmail(profile))}" />
      </label>
      <label class="field">
        <span>Telefonnummer</span>
        <input name="phone" type="tel" value="${escapeHtml(profile?.phone || "")}" placeholder="+43 ..." />
      </label>
      ${isSelf ? "" : `<p class="notice">Die Login-E-Mail des Clients kann nur der Client selbst ändern. Diese E-Mail wird als Kontaktadresse im Profil gespeichert.</p>`}
      <button class="btn primary">Stammdaten speichern</button>
    </form>
  `;
}

function splitName(fullName) {
  const parts = String(fullName || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return { firstName: parts[0] || "", lastName: "" };
  return {
    firstName: parts.slice(0, -1).join(" "),
    lastName: parts.at(-1) || "",
  };
}

function renderClientProfile() {
  const relationship = state.clients.find((item) => item.client_id === state.selectedClientId);
  if (!relationship) {
    return `
      <section class="empty-card stack">
        <h2>Profil nicht gefunden</h2>
        <p>Der Client ist in deiner aktuellen Organisation nicht sichtbar.</p>
        <button class="btn" data-view="clients">Zurück</button>
      </section>
    `;
  }

  const client = relationship.client || {};
  const clientTasks = state.tasks.filter((task) => task.client_id === relationship.client_id);
  const openTasks = clientTasks.filter((task) => task.status === "open" && !isOverdue(task));
  const overdueTasks = clientTasks.filter(isOverdue);
  const doneTasks = clientTasks.filter((task) => task.status === "done");
  const clientNotes = state.notes.filter((note) => note.client_id === relationship.client_id);
  const completionRate = clientTasks.length ? Math.round((doneTasks.length / clientTasks.length) * 100) : 0;

  return `
    <section class="grid two">
      <div class="stack">
        <article class="panel">
          <div class="toolbar">
            <div>
              <h2>${escapeHtml(personName(client, "Client"))}</h2>
              <p class="muted">${escapeHtml(personEmail(client))}</p>
            </div>
            <button class="btn" data-view="clients">Zurück</button>
            <button class="btn danger" data-remove-client="${relationship.client_id}" data-client-name="${escapeHtml(personName(client, "Client"))}">Client entfernen</button>
          </div>
          <div class="grid metrics client-profile-metrics">
            ${metricCard("Offen", openTasks.length)}
            ${metricCard("Überfällig", overdueTasks.length)}
            ${metricCard("Erledigt", doneTasks.length)}
            ${metricCard("Gesamt", clientTasks.length)}
            ${metricCard("Umsetzung", `${completionRate}%`)}
          </div>
        </article>
        ${renderTaskGroup("Überfällige Aufgaben", overdueTasks)}
        ${renderTaskGroup("Offene Aufgaben", openTasks)}
        ${renderTaskGroup("Erledigte Aufgaben", doneTasks)}
      </div>
      <aside class="stack">
        ${renderProfileForm(client, "Stammdaten", false)}
        <form class="panel form-grid" data-action="create-note">
          <h2>Private Notiz</h2>
          <p class="muted">Nur du kannst diese Notizen sehen. Sie werden dem Client nicht angezeigt.</p>
          <input type="hidden" name="client_id" value="${escapeHtml(relationship.client_id)}" />
          ${renderRichTextField("text", "Notiz", "", {
            required: true,
            placeholder: "Beobachtung, Kontext oder Gesprächspunkt festhalten",
          })}
          <button class="btn primary">Notiz speichern</button>
        </form>
        <div class="panel">
          <h2>Notizen</h2>
          <div class="task-list" style="margin-top:14px">
            ${
              clientNotes.length
                ? clientNotes.map(renderNote).join("")
                : `<p class="muted">Noch keine privaten Notizen.</p>`
            }
          </div>
        </div>
      </aside>
    </section>
  `;
}

function renderTaskGroup(title, tasks) {
  return `
    <section class="panel">
      <div class="toolbar">
        <h2>${escapeHtml(title)}</h2>
      </div>
      <div class="task-list">
        ${tasks.length ? tasks.map(renderTask).join("") : `<p class="muted">Keine Einträge.</p>`}
      </div>
    </section>
  `;
}

function renderNote(note) {
  return `
    <article class="task-row">
      ${renderRichPreview(note.text, "Keine Notiz", "note-text")}
      <span class="chip">${new Intl.DateTimeFormat("de-AT", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(note.created_at))}</span>
    </article>
  `;
}

function renderInvites() {
  const openInvites = state.invitations.filter((invite) => !invite.accepted_at);

  return `
    <section class="stack">
      ${renderInviteForm()}
      ${renderOpenInvites(openInvites)}
    </section>
  `;
}

function renderInviteForm() {
  const userId = state.session.user.id;
  const role = currentRole();
  const showClientLimit = role === "coach";
  const openClientInvites = state.invitations.filter(
    (invite) =>
      !invite.accepted_at &&
      invite.role === "client" &&
      (invite.client_coach_id || invite.invited_by) === userId,
  ).length;
  const clientLimit = Number(state.settings?.client_limit || 10);
  const activeMemberIds = activeClientMemberIds();
  const workspaceActiveClients = activeMemberIds.size;
  const activeClientSlots = new Set(
    state.clients
      .filter((relationship) => relationship.coach_id === userId && activeMemberIds.has(relationship.client_id))
      .map((relationship) => relationship.client_id),
  ).size;
  const usedClientSlots = activeClientSlots;
  const clientLimitReached = clientLimit > 0 && usedClientSlots >= clientLimit;
  return `
    <form class="panel form-grid invite-flow" data-action="create-invite">
      <h2>Person einladen</h2>
      ${
        showClientLimit
          ? `
            <div class="limit-meter ${clientLimitReached ? "is-full" : ""}">
              <div>
                <strong>Testphase</strong>
                <span>${usedClientSlots}/${clientLimit} aktive Client-Plätze genutzt</span>
              </div>
              <small>${openClientInvites} offene Einladung${openClientInvites === 1 ? "" : "en"} · mehr Plätze können später freigeschaltet werden.</small>
            </div>
          `
          : `<p class="notice">Owner-Ansicht: ${workspaceActiveClients} aktive Client-Mitglied${workspaceActiveClients === 1 ? "" : "er"} im Workspace. Lade hier vor allem Coaches ein; jeder Coach hat eigene Client-Plätze.</p>`
      }
      <label class="field">
        <span>E-Mail</span>
        <input name="email" type="email" required placeholder="client@example.com" />
      </label>
      <label class="field">
        <span>Rolle</span>
        <select name="role">
          ${
            role === "owner"
              ? `
                <option value="coach">${escapeHtml(state.preset?.practitioner_label || "Coach")}</option>
                <option value="client">${escapeHtml(state.preset?.client_label || "Client")}</option>
                <option value="owner">Owner</option>
              `
              : `<option value="client">${escapeHtml(state.preset?.client_label || "Client")}</option>`
          }
        </select>
      </label>
      <button class="btn primary">Code erstellen</button>
      ${
        showClientLimit && clientLimitReached
          ? `<p class="notice">Das Testlimit für Clients ist erreicht. Weitere Client-Einladungen benötigen eine Freischaltung.</p>`
          : ""
      }
    </form>
  `;
}

function renderReminders() {
  const rows = reminderRows();

  return `
    <section class="panel">
      <div class="toolbar">
        <div>
          <h2>Erinnerungen</h2>
          <p class="muted">Offene und überfällige Aufgaben pro Client bündeln und manuell versenden.</p>
        </div>
      </div>
      <div class="task-list">
        ${
          rows.length
            ? rows.map((row) => `
              <article class="reminder-row">
                <div>
                  <strong>${escapeHtml(row.clientName)}</strong>
                  <p class="muted">${escapeHtml(row.clientEmail)}</p>
                </div>
                <div class="chips">
                  <span class="chip">${row.openCount} offen</span>
                  ${row.overdueCount ? `<span class="chip overdue">${row.overdueCount} überfällig</span>` : ""}
                </div>
                <button class="btn primary" data-reminder-client="${row.clientId}">Erinnerung senden</button>
              </article>
            `).join("")
            : `<p class="muted">Aktuell gibt es keine offenen oder überfälligen Aufgaben.</p>`
        }
      </div>
    </section>
  `;
}

function reminderRows() {
  return state.clients
    .map((relationship) => {
      const clientTasks = state.tasks.filter(
        (task) => task.client_id === relationship.client_id && task.status === "open",
      );
      const overdueCount = clientTasks.filter(isOverdue).length;
      return {
        clientId: relationship.client_id,
        clientName: personName(relationship.client, "Client"),
        clientEmail: personEmail(relationship.client),
        openCount: clientTasks.length,
        overdueCount,
        tasks: clientTasks,
      };
    })
    .filter((row) => row.openCount > 0);
}

function renderReminderModal() {
  const row = reminderRows().find((item) => item.clientId === state.reminderModalClientId);
  if (!row) return "";

  return `
    <div class="modal">
      <section class="modal-card stack invite-delivery">
        <div class="toolbar">
          <div>
            <h2>Erinnerung senden</h2>
            <p class="muted">${escapeHtml(row.clientEmail)} · ${row.openCount} offene Aufgabe(n)</p>
          </div>
          <button class="btn" data-action="close-reminder-modal">Schließen</button>
        </div>
        <div class="delivery-grid">
          <button class="delivery-card preferred" data-share-reminder="${row.clientId}">
            <strong>Teilen</strong>
            <span>Handy-Menü für Mail, WhatsApp oder andere Apps öffnen</span>
          </button>
          <button class="delivery-card" data-mail-reminder="${row.clientId}">
            <strong>Mail-App</strong>
            <span>Standard-Mailprogramm öffnen</span>
          </button>
          ${reminderButton("gmail", row.clientId, "Gmail", "Entwurf in Gmail öffnen")}
          ${reminderButton("outlook", row.clientId, "Outlook", "Entwurf in Outlook Web öffnen")}
          ${reminderButton("gmx", row.clientId, "GMX", "Text kopieren und GMX öffnen")}
          ${reminderButton("webde", row.clientId, "WEB.DE", "Text kopieren und WEB.DE öffnen")}
          ${reminderButton("yahoo", row.clientId, "Yahoo", "Entwurf in Yahoo öffnen")}
          <button class="delivery-card" data-copy-reminder="${row.clientId}">
            <strong>Text kopieren</strong>
            <span>Erinnerung in Zwischenablage legen</span>
          </button>
        </div>
      </section>
    </div>
  `;
}

function reminderButton(provider, clientId, title, description) {
  return `
    <button class="delivery-card" data-reminder-webmail="${provider}" data-client-id="${clientId}">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(description)}</span>
    </button>
  `;
}

function renderInviteModal() {
  const invite = state.invitations.find((item) => item.id === state.inviteModalId);
  if (!invite) return "";

  return `
    <div class="modal">
      <section class="modal-card stack invite-delivery">
        <div class="toolbar">
          <div>
            <h2>Wie möchtest du die Einladung versenden?</h2>
            <p class="muted">${escapeHtml(invite.email)} · Code ${escapeHtml(invite.code)}</p>
          </div>
          <button class="btn" data-action="close-invite-modal">Schließen</button>
        </div>
        <div class="delivery-grid">
          <button class="delivery-card preferred" data-share-invite="${invite.id}">
            <strong>Teilen</strong>
            <span>Handy-Menü für Mail, WhatsApp oder andere Apps öffnen</span>
          </button>
          <button class="delivery-card" data-mail-invite="${invite.id}">
            <strong>Mail-App</strong>
            <span>Standard-Mailprogramm öffnen</span>
          </button>
          ${deliveryButton("gmail", invite.id, "Gmail", "Entwurf in Gmail öffnen")}
          ${deliveryButton("outlook", invite.id, "Outlook", "Entwurf in Outlook Web öffnen")}
          ${deliveryButton("gmx", invite.id, "GMX", "Text kopieren und GMX öffnen")}
          ${deliveryButton("webde", invite.id, "WEB.DE", "Text kopieren und WEB.DE öffnen")}
          ${deliveryButton("yahoo", invite.id, "Yahoo", "Entwurf in Yahoo öffnen")}
          <button class="delivery-card" data-copy-invite="${invite.id}">
            <strong>Text kopieren</strong>
            <span>Einladung in Zwischenablage legen</span>
          </button>
        </div>
      </section>
    </div>
  `;
}

function deliveryButton(provider, inviteId, title, description) {
  return `
    <button class="delivery-card" data-webmail="${provider}" data-invite-id="${inviteId}">
      <strong>${escapeHtml(title)}</strong>
      <span>${escapeHtml(description)}</span>
    </button>
  `;
}

function renderOpenInvites(openInvites, compact = false) {
  return `
    <section class="panel open-invites-panel ${compact ? "compact" : ""}">
      <div class="toolbar">
        <h2>Offene Einladungen</h2>
      </div>
      <div class="open-invite-list">
        ${
          openInvites.length
            ? openInvites.map((invite) => `
              <button class="open-invite-row ${invite.id === state.lastInviteId ? "active" : ""}" data-select-invite="${invite.id}">
                <span>${escapeHtml(invite.email)}</span>
                <code>${escapeHtml(invite.code)}</code>
              </button>
            `).join("")
            : `<p class="muted">Keine offenen Einladungen.</p>`
        }
      </div>
    </section>
  `;
}

function renderSettings() {
  const brand = activeBrandSettings();
  const customHeroImage = customHeroImageForPreset(state.organization.industry_preset_id);
  return `
    <section class="grid two">
      <form class="panel form-grid" data-action="save-settings">
        <h2>Interface und Branding</h2>
        ${
          isPlatformOwner()
            ? `<label class="field">
                <span>Branche</span>
                <select name="preset" data-preset-switch>${presetOptions(state.organization.industry_preset_id)}</select>
              </label>
              <p class="notice">Testmodus für Betreiber: Branding wird je Branche getrennt gespeichert.</p>`
            : `<label class="field">
                <span>Branche</span>
                <input value="${escapeHtml(state.preset?.label || "")}" disabled />
                <input type="hidden" name="preset" value="${escapeHtml(state.organization.industry_preset_id)}" />
              </label>`
        }
        <label class="field">
          <span>Firmenname</span>
          <input name="display_name" required value="${escapeHtml(brand.display_name)}" />
        </label>
        <label class="field">
          <span>Logo-Kürzel</span>
          <input name="logo_text" maxlength="4" required value="${escapeHtml(brand.logo_text)}" />
        </label>
        <label class="field">
          <span>Logo hochladen</span>
          <input name="logo_file" type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" />
        </label>
        <label class="field">
          <span>Oder Logo-URL</span>
          <input name="logo_url" type="url" placeholder="https://..." value="${escapeHtml(brand.logo_url)}" />
        </label>
        ${
          brand.logo_url
            ? `<label class="checkline">
                <input name="remove_logo" type="checkbox" value="true" />
                <span>Logo entfernen und Kürzel anzeigen</span>
              </label>`
            : ""
        }
        <label class="field">
          <span>Bild hochladen</span>
          <input name="hero_file" type="file" accept="image/png,image/jpeg,image/webp" />
        </label>
        ${
          customHeroImage
            ? `<label class="checkline">
                <input name="remove_hero_image" type="checkbox" value="true" />
                <span>Eigenes Bild entfernen und Branchenbild anzeigen</span>
              </label>`
            : ""
        }
        <label class="field">
          <span>Primärfarbe</span>
          <input name="primary_color" type="color" value="${escapeHtml(brand.primary_color)}" />
        </label>
        <label class="field">
          <span>Sekundärfarbe</span>
          <input name="secondary_color" type="color" value="${escapeHtml(brand.secondary_color)}" />
        </label>
        <button class="btn primary">Speichern</button>
      </form>
      ${renderTemplateSettings()}
    </section>
  `;
}

function renderTemplateSettings() {
  const activeTemplates = state.templates.filter(
    (template) => template.preset_id === state.organization.industry_preset_id,
  );

  return `
    <section class="panel stack">
      <div>
        <h2>Standard-Aufgaben</h2>
        <p class="muted">Diese Templates stehen beim Erstellen einer Aufgabe zur Auswahl.</p>
      </div>
      <form class="form-grid" data-action="create-template">
        <label class="field">
          <span>Titel</span>
          <input name="title" required placeholder="z. B. Wochenreflexion" />
        </label>
        ${renderRichTextField("description", "Beschreibung", "", {
          required: true,
          placeholder: "Was soll der Client tun?",
        })}
        <button class="btn primary">Template speichern</button>
      </form>
      <div class="task-list">
        ${
          activeTemplates.length
            ? activeTemplates.map((template) => `
              ${renderTemplateRow(template)}
            `).join("")
            : `<p class="muted">Noch keine Templates für diese Branche.</p>`
        }
      </div>
    </section>
  `;
}

function renderTemplateRow(template) {
  if (state.editingTemplateId === template.id) {
    return `
      <form class="template-row editing" data-action="update-template">
        <input type="hidden" name="id" value="${template.id}" />
        <label class="field">
          <span>Titel</span>
          <input name="title" required value="${escapeHtml(template.title)}" />
        </label>
        ${renderRichTextField("description", "Beschreibung", template.description, { required: true })}
        <div class="template-actions">
          <button class="btn primary">Speichern</button>
          <button type="button" class="btn" data-cancel-template-edit>Abbrechen</button>
        </div>
      </form>
    `;
  }

  return `
    <article class="template-row readable-row" data-open-reader="template:${template.id}" role="button" tabindex="0">
      <div>
        <strong>${escapeHtml(template.title)}</strong>
        ${renderRichPreview(template.description, "Keine Beschreibung", "template-description")}
      </div>
      <div class="template-actions">
        <button class="icon-btn" title="Template bearbeiten" data-edit-template="${template.id}">Bearbeiten</button>
        <button class="icon-btn danger" title="Template löschen" data-delete-template="${template.id}">Löschen</button>
      </div>
    </article>
  `;
}

function readerData() {
  const [type, id] = String(state.readerModal || "").split(":");

  if (type === "task") {
    const task = state.tasks.find((item) => item.id === id);
    if (!task) return null;
    const person = isCoachRole() ? personName(task.client, "Client") : personName(task.coach, "Coach");
    const status = task.status === "done" ? "Erledigt" : isOverdue(task) ? "Überfällig" : "Offen";
    const statusClass = task.status === "done" ? "done" : isOverdue(task) ? "overdue" : "";
    const personMeta =
      isCoachRole() && task.client_id
        ? { label: person, clientId: task.client_id, className: "clickable" }
        : { label: person };
    return {
      eyebrow: "Aufgabe",
      title: task.title,
      body: task.description,
      attachments: task.attachments || [],
      emptyText: "Keine Beschreibung",
      meta: [
        personMeta,
        { label: status, className: statusClass },
        { label: `Fällig ${formatDate(task.due_date)}` },
        task.reflections?.length ? { label: "Reflexion vorhanden", className: "done" } : null,
      ].filter(Boolean),
    };
  }

  if (type === "reflection") {
    const reflection = state.reflections.find((item) => item.id === id);
    if (!reflection) return null;
    return {
      eyebrow: "Reflexion",
      title: reflection.tasks?.title || "Reflexion",
      body: reflection.text,
      attachments: reflection.attachments || [],
      emptyText: "Keine Reflexion",
      meta: [
        reflection.mood ? { label: reflection.mood } : null,
        { label: personName(reflection.client, "Client") },
      ].filter(Boolean),
    };
  }

  if (type === "template") {
    const template = state.templates.find((item) => item.id === id);
    if (!template) return null;
    return {
      eyebrow: "Template",
      title: template.title,
      body: template.description,
      attachments: [],
      emptyText: "Keine Beschreibung",
      meta: [
        { label: state.preset?.label || "Branche" },
        { label: "Standard-Aufgabe" },
      ],
    };
  }

  return null;
}

function renderReaderMeta(item) {
  const classes = `chip ${item.className || ""}`.trim();
  if (item.clientId) {
    return `<button class="${classes}" data-reader-client-profile="${escapeHtml(item.clientId)}">${escapeHtml(item.label)}</button>`;
  }
  return `<span class="${classes}">${escapeHtml(item.label)}</span>`;
}

function renderReaderModal() {
  const data = readerData();
  if (!data) return "";

  return `
    <div class="modal reader-modal-backdrop" data-reader-backdrop>
      <section class="modal-card reader-modal" role="dialog" aria-modal="true" aria-label="${escapeHtml(data.title)}">
        <header class="reader-head">
          <div>
            <span class="reader-eyebrow">${escapeHtml(data.eyebrow)}</span>
            <h2>${escapeHtml(data.title)}</h2>
          </div>
          <button class="icon-btn" data-action="close-reader-modal" aria-label="Leseansicht schließen">×</button>
        </header>
        <div class="chips reader-meta">
          ${data.meta.map(renderReaderMeta).join("")}
        </div>
        <div class="reader-body">
          ${richTextToHtml(data.body) || `<p>${escapeHtml(data.emptyText)}</p>`}
          ${renderAttachmentList(data.attachments)}
        </div>
      </section>
    </div>
  `;
}

function renderReflectionModal() {
  const task = state.modalTask;
  return `
    <div class="modal">
      <form class="modal-card stack" data-action="complete-task">
        <h2>${escapeHtml(task.title)}</h2>
        <p class="muted">${escapeHtml(state.preset?.reflection_prompt || "Wie ist es dir damit gegangen?")}</p>
        ${renderRichTextField("text", "Reflexion", "", { required: true })}
        ${renderFileField("Bilder, Videos oder Dateien zur Reflexion")}
        <label class="field">
          <span>Gefühl / Status</span>
          <select name="mood" required>
            <option value="">Bitte auswählen</option>
            <option>Gut gelungen</option>
            <option>Teilweise gelungen</option>
            <option>Schwierig</option>
            <option>Bitte besprechen</option>
          </select>
        </label>
        <div class="modal-actions">
          <button type="button" class="btn" data-action="close-modal">Abbrechen</button>
          <button class="btn primary">Abschließen</button>
        </div>
        <p class="form-submit-error" data-submit-error hidden></p>
      </form>
    </div>
  `;
}

function presetOptions(selected = "generic_coaching") {
  if (!state.presets.length) {
    return `<option value="">Branchen werden geladen...</option>`;
  }

  return state.presets
    .map((preset) => `<option value="${preset.id}" ${preset.id === selected ? "selected" : ""}>${escapeHtml(preset.label)}</option>`)
    .join("");
}

async function submitAuth(form, submitter) {
  const values = Object.fromEntries(new FormData(form));
  const mode = submitter?.value || "login";
  state.error = "";
  state.message = "";
  state.resetToDashboardAfterAuth = true;

  const { error } = await state.supabase.auth.signInWithPassword({
    email: values.email,
    password: values.password,
  });
  if (error) {
    state.resetToDashboardAfterAuth = false;
    throw new Error(readableAuthError(error));
  }
}

async function submitInviteSignup(values) {
  if (!values.email || !values.code || !values.first_name || !values.last_name || !values.password) {
    throw new Error("Bitte E-Mail, Einladungscode, Vorname, Nachname und Passwort ausfüllen.");
  }

  const inviteInfo = state.inviteInfo || (await fetchInvitationInfo(values.email, values.code));
  if (!inviteInfo) {
    throw new Error("Einladungscode wurde nicht gefunden oder passt nicht zu dieser E-Mail-Adresse.");
  }

  state.inviteInfo = inviteInfo;
  const companyName = String(values.company_name || "").trim();
  const selectedPresetId = String(values.preset_id || "").trim();

  if (inviteInfo.role === "coach" && (!companyName || !selectedPresetId)) {
    state.error = !companyName ? "Bitte Firmennamen eingeben." : "Bitte Branche auswählen.";
    state.message = "Coach-Einladung erkannt. Ergänze bitte Firmenname und Branche für deinen Workspace.";
    renderInviteRegistration({
      email: values.email,
      code: values.code,
      draft: {
        first_name: values.first_name,
        last_name: values.last_name,
        company_name: companyName,
      },
    });
    return;
  }

  const fullName = `${values.first_name.trim()} ${values.last_name.trim()}`.trim();

  const { data, error } = await state.supabase.auth.signUp({
    email: values.email,
    password: values.password,
    options: {
      data: {
        first_name: values.first_name.trim(),
        last_name: values.last_name.trim(),
        full_name: fullName,
      },
    },
  });

  if (error) {
    const message = String(error.message || "").toLowerCase();
    if (message.includes("already") || message.includes("registered") || message.includes("exists")) {
      rememberPendingInvite(values.email, values.code, selectedPresetId, companyName);
      clearInviteParams();
      state.message = "Diese E-Mail-Adresse ist bereits registriert. Bitte logge dich normal ein.";
      renderAuth();
      return;
    }
    throw new Error(readableAuthError(error));
  }

  const existingAccount =
    data.user &&
    Array.isArray(data.user.identities) &&
    data.user.identities.length === 0;

  if (existingAccount) {
    rememberPendingInvite(values.email, values.code, selectedPresetId, companyName);
    clearInviteParams();
    state.message =
      "Diese E-Mail-Adresse ist bereits registriert. Bitte logge dich mit deinem bestehenden Passwort ein. Die Einladung wird danach automatisch angenommen.";
    renderAuth();
    return;
  }

  if (!data.session) {
    rememberPendingInvite(values.email, values.code, selectedPresetId, companyName);
    state.message =
      "Der Zugang wurde angelegt, ist aber noch nicht aktiv. Bitte prüfe dein E-Mail-Postfach und bestätige die Registrierung. Danach kannst du dich normal einloggen.";
    renderInviteRegistration({ email: values.email, code: "" });
    return;
  }

  const { error: profileError } = await state.supabase.rpc("ensure_profile", {
    user_name: fullName,
  });
  if (profileError) throw profileError;

  const { error: inviteError } = await state.supabase.rpc("accept_invitation", {
    invite_code: values.code,
    selected_preset_id: inviteInfo.role === "coach" ? selectedPresetId : null,
    company_name: inviteInfo.role === "coach" ? companyName : "",
  });
  if (inviteError) throw inviteError;

  await state.supabase.auth.signOut();
  state.session = null;
  state.organization = null;
  clearInviteParams();
  state.message = "Registrierung erfolgreich. Bitte logge dich jetzt mit E-Mail und Passwort ein.";
  renderAuth();
}

async function fetchInvitationInfo(email, code) {
  if (!email || !code) return null;
  const { data, error } = await state.supabase.rpc("get_invitation_info", {
    invite_code: code,
    invite_email: email,
  });
  if (error) throw error;
  return data?.[0] || null;
}

async function detectInviteFromForm(form) {
  const values = Object.fromEntries(new FormData(form));
  if (!values.email || !values.code || String(values.code).trim().length < 6) return;
  const info = await fetchInvitationInfo(values.email, values.code);
  if (!info) return;
  state.inviteInfo = info;
  state.message =
    info.role === "coach"
      ? "Coach-Einladung erkannt. Bitte wähle deine Branche."
      : "Einladung erkannt. Bitte Registrierung abschließen.";
  renderInviteRegistration({
    email: values.email,
    code: values.code,
    draft: {
      first_name: values.first_name,
      last_name: values.last_name,
      company_name: values.company_name,
    },
  });
}

async function updateProfileName(values) {
  if (!values.first_name || !values.last_name) {
    throw new Error("Bitte Vorname und Nachname ausfüllen.");
  }

  const fullName = `${values.first_name.trim()} ${values.last_name.trim()}`.trim();
  const { error } = await state.supabase
    .from("profiles")
    .update({ full_name: fullName })
    .eq("id", state.session.user.id);
  if (error) throw error;

  state.message = "Profil gespeichert.";
  await loadApp();
}

async function updateProfileContact(values) {
  if (!values.first_name || !values.last_name || !values.contact_email) {
    throw new Error("Bitte Vorname, Nachname und E-Mail ausfüllen.");
  }

  const fullName = `${values.first_name.trim()} ${values.last_name.trim()}`.trim();
  const targetUserId = values.user_id;
  const isSelf = values.is_self === "true";
  const newEmail = String(values.contact_email).trim().toLowerCase();

  if (isSelf && newEmail !== String(state.session.user.email || "").toLowerCase()) {
    const { error: authError } = await state.supabase.auth.updateUser({ email: newEmail });
    if (authError) throw new Error(readableAuthError(authError));
  }

  const { error } = await state.supabase.rpc("update_profile_contact", {
    target_user_id: targetUserId,
    new_full_name: fullName,
    new_contact_email: newEmail,
    new_phone: values.phone || "",
  });
  if (error) throw error;

  state.message =
    isSelf && newEmail !== String(state.session.user.email || "").toLowerCase()
      ? "Stammdaten gespeichert. Bitte prüfe ggf. dein E-Mail-Postfach, um die neue Login-E-Mail zu bestätigen."
      : "Stammdaten gespeichert.";

  await ensureProfile();
  await loadWorkspaceData();
  renderApp();
}

function readableAuthError(error) {
  const message = String(error?.message || "").toLowerCase();

  if (message.includes("email not confirmed") || message.includes("not confirmed")) {
    return "Deine E-Mail-Adresse ist noch nicht bestätigt. Bitte prüfe dein Postfach und bestätige die Registrierung.";
  }

  if (message.includes("invalid login") || message.includes("invalid credentials")) {
    return "E-Mail-Adresse oder Passwort ist nicht bekannt. Wenn du noch keinen Zugang hast, wende dich bitte an deinen Coach, Trainer oder Berater.";
  }

  if (message.includes("rate limit")) {
    return "Zu viele Versuche in kurzer Zeit. Bitte warte ein paar Minuten und probiere es erneut.";
  }

  return error?.message || "Anmeldung nicht möglich. Bitte versuche es erneut.";
}

async function handleSubmit(event) {
  const form = event.target.closest("form");
  if (!form) return;
  event.preventDefault();
  syncRichEditors(form);
  const action = form.dataset.action;
  const values = Object.fromEntries(new FormData(form));
  values.client_ids = new FormData(form).getAll("client_ids");
  values.group_ids = new FormData(form).getAll("group_ids");
  values.group_member_ids = new FormData(form).getAll("group_member_ids");
  values.attachment_files = new FormData(form).getAll("attachment_files").filter((file) => file?.size > 0);
  state.error = "";
  state.message = "";
  clearFormSubmitError(form);

  try {
    const missingRichText = [...form.querySelectorAll("[data-rich-required='true']")].find(
      (editor) => !richTextPlain(editor.innerHTML),
    );
    if (missingRichText) {
      throw new Error("Bitte alle Pflichtfelder ausfüllen.");
    }
    if (action === "auth") await submitAuth(form, event.submitter);
    if (action === "invite-signup") await submitInviteSignup(values);
    if (action === "update-profile-name") await updateProfileName(values);
    if (action === "update-profile-contact") await updateProfileContact(values);
    if (action === "create-workspace") await createWorkspace(values);
    if (action === "accept-invite") await acceptInvite(values);
    if (action === "create-task") await createTask(values);
    if (action === "create-group") await createGroup(values);
    if (action === "save-group") await saveGroup(values);
    if (action === "create-invite") await createInvite(values);
    if (action === "save-settings") await saveSettings(values);
    if (action === "create-template") await createTemplate(values);
    if (action === "update-template") await updateTemplate(values);
    if (action === "complete-task") await completeTask(values);
    if (action === "create-note") await createNote(values);
  } catch (error) {
    state.error = error.message;
    if (["complete-task", "create-task"].includes(action) && showFormSubmitError(form, error.message)) {
      return;
    }
    if (inviteParams().hasInviteLink) {
      renderAuth();
    } else if (state.organization) {
      renderApp();
    } else if (state.session) {
      renderWorkspaceStart();
    } else {
      renderAuth();
    }
  }
}

async function createWorkspace(values) {
  const { error } = await state.supabase.rpc("create_workspace", {
    workspace_name: values.name,
    preset_id: values.preset,
  });
  if (error) throw error;
  await loadApp();
}

async function acceptInvite(values) {
  const { data: acceptedOrgId, error } = await state.supabase.rpc("accept_invitation", {
    invite_code: values.code,
    selected_preset_id: null,
  });
  if (error) throw error;
  if (acceptedOrgId) rememberActiveWorkspace(acceptedOrgId);
  clearInviteParams();
  await loadApp();
}

function clearInviteParams() {
  const url = new URL(window.location.href);
  url.searchParams.delete("invite");
  url.searchParams.delete("code");
  url.searchParams.delete("email");
  url.searchParams.delete("role");
  window.history.replaceState({}, "", url.toString());
}

async function ensureAttachmentSupport() {
  const { error } = await state.supabase.from("task_attachments").select("id").limit(1);
  if (error) {
    throw new Error(
      "Dateiupload ist vorbereitet, aber das neue Supabase-SQL muss noch ausgeführt werden. Bitte zuerst supabase/schema.sql im SQL Editor ausführen.",
    );
  }
}

function safeFileName(name = "datei") {
  const cleaned = String(name || "datei")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 120);
  return cleaned || "datei";
}

async function uploadAttachments(files = [], taskId, reflectionId = null) {
  if (!files.length) return;
  const maxFileSize = 50 * 1024 * 1024;

  for (const [index, file] of files.entries()) {
    if (file.size > maxFileSize) {
      throw new Error(`${file.name} ist größer als 50 MB.`);
    }

    const path = [
      state.organization.id,
      taskId,
      reflectionId || "task",
      `${Date.now()}-${index}-${safeFileName(file.name)}`,
    ].join("/");

    const { error: uploadError } = await state.supabase.storage.from("task-attachments").upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "application/octet-stream",
    });
    if (uploadError) throw uploadError;

    const { error: insertError } = await state.supabase.from("task_attachments").insert({
      organization_id: state.organization.id,
      task_id: taskId,
      reflection_id: reflectionId,
      uploaded_by: state.session.user.id,
      file_name: file.name,
      file_type: file.type || "application/octet-stream",
      file_size: file.size,
      storage_path: path,
    });
    if (insertError) throw insertError;
  }
}

function readableUploadError(error) {
  const message = String(error?.message || "").toLowerCase();
  const status = String(error?.statusCode || error?.status || "");

  if (
    missingAttachmentSchema(error) ||
    message.includes("create_reflection_for_task") ||
    message.includes("finish_task_after_reflection") ||
    (message.includes("function") && message.includes("does not exist"))
  ) {
    return "Dateiupload ist vorbereitet, aber das neue Supabase-SQL muss noch ausgeführt werden. Bitte zuerst supabase/schema.sql im SQL Editor ausführen.";
  }

  if (
    message.includes("exceeded") ||
    message.includes("too large") ||
    message.includes("payload") ||
    message.includes("file size") ||
    status === "413"
  ) {
    return "Die Datei ist zu groß oder der Supabase-Speicher ist noch auf das alte Limit gesetzt. Bitte supabase/schema.sql erneut ausführen; danach sind bis zu 50 MB pro Datei möglich.";
  }

  if (message.includes("row-level security") || message.includes("policy") || message.includes("unauthorized")) {
    return "Die Datei konnte wegen einer Speicher-Berechtigung nicht hochgeladen werden. Bitte Supabase-SQL aktualisieren und erneut versuchen.";
  }

  if (message.includes("bucket") || message.includes("storage")) {
    return "Der Datei-Speicher ist noch nicht richtig vorbereitet. Bitte supabase/schema.sql erneut im Supabase SQL Editor ausführen.";
  }

  return error?.message || "Die Datei konnte nicht hochgeladen werden. Bitte versuche es erneut.";
}

async function openAttachment(attachmentId) {
  const attachment = state.attachments.find((item) => item.id === attachmentId);
  if (!attachment) return;

  const { data, error } = await state.supabase.storage
    .from("task-attachments")
    .createSignedUrl(attachment.storage_path, 60 * 5, {
      download: attachment.file_name,
    });
  if (error) throw error;
  window.open(data.signedUrl, "_blank", "noopener,noreferrer");
}

async function createTask(values) {
  const selectedGroupIds = [...new Set(values.group_ids || [])].filter(Boolean);
  if (selectedGroupIds.length && state.batchSchemaMissing) {
    throw new Error("Gruppenfortschritte sind vorbereitet, aber das neue Supabase-SQL muss noch ausgeführt werden.");
  }

  const groupRecipientRows = selectedGroupIds.flatMap((groupId) => {
    const members = groupMembers(groupId);
    if (members.length < 2) {
      const group = state.groups.find((item) => item.id === groupId);
      throw new Error(`Die Gruppe "${group?.name || "Gruppe"}" braucht mindestens zwei Personen.`);
    }
    return members.map((member) => ({ group_id: groupId, client_id: member.client_id }));
  });
  const groupClientIds = groupRecipientRows.map((row) => row.client_id);
  const directClientIds = (values.client_ids || []).filter(Boolean);
  const clientIds = [...new Set([...directClientIds, ...groupClientIds])];
  const files = values.attachment_files || [];
  if (!clientIds.length) {
    throw new Error("Bitte mindestens einen Client oder eine Gruppe auswählen.");
  }

  if (files.length) {
    await ensureAttachmentSupport();
  }

  let assignmentBatchId = null;
  if (selectedGroupIds.length) {
    const { data: batch, error: batchError } = await state.supabase
      .from("assignment_batches")
      .insert({
        organization_id: state.organization.id,
        coach_id: state.session.user.id,
        title: values.title,
        description: richTextToHtml(values.description || ""),
        due_date: values.due_date,
        recipient_count: clientIds.length,
      })
      .select("id")
      .single();
    if (batchError) throw batchError;
    assignmentBatchId = batch.id;

    const recipientRows = groupRecipientRows.map((row) => ({
      organization_id: state.organization.id,
      batch_id: assignmentBatchId,
      group_id: row.group_id,
      client_id: row.client_id,
    }));
    const { error: recipientError } = await state.supabase.from("assignment_batch_recipients").insert(recipientRows);
    if (recipientError) throw recipientError;
  }

  const rows = clientIds.map((clientId) => {
    const row = {
      organization_id: state.organization.id,
      coach_id: state.session.user.id,
      client_id: clientId,
      title: values.title,
      description: richTextToHtml(values.description || ""),
      due_date: values.due_date,
    };
    if (assignmentBatchId) row.assignment_batch_id = assignmentBatchId;
    return row;
  });

  const { data: createdTasks, error } = await state.supabase.from("tasks").insert(rows).select("*");
  if (error) {
    if (assignmentBatchId) {
      await state.supabase.from("assignment_batches").delete().eq("id", assignmentBatchId).eq("organization_id", state.organization.id);
    }
    throw error;
  }
  if (files.length) {
    for (const task of createdTasks || []) {
      await uploadAttachments(files, task.id);
    }
  }
  state.message = "";
  state.taskComposerOpen = false;
  resetTaskComposerState();
  showToast("Aufgabe erfolgreich gesendet");
  await loadWorkspaceData();
  renderApp();
}

async function createGroup(values) {
  const name = String(values.name || "").trim();
  if (!name) throw new Error("Bitte Gruppennamen eingeben.");
  if (state.clients.length < 2) {
    throw new Error("Für eine Gruppe brauchst du mindestens zwei aktive Personen.");
  }

  openGroupEditor("", name);
}

async function saveGroup(values) {
  const editor = state.groupEditor;
  const name = String(values.name || editor?.name || "").trim();
  const memberIds = [...new Set(editor?.selectedIds || values.group_member_ids || [])].filter((clientId) =>
    state.clients.some((item) => item.client_id === clientId),
  );

  if (!name) throw new Error("Bitte Gruppennamen eingeben.");
  if (memberIds.length < 2) {
    throw new Error("Bitte mindestens zwei Personen auswählen.");
  }

  let groupId = values.group_id || editor?.groupId || "";

  if (groupId) {
    const { error: updateError } = await state.supabase
      .from("client_groups")
      .update({ name })
      .eq("organization_id", state.organization.id)
      .eq("id", groupId);
    if (updateError) throw updateError;

    const { error: deleteError } = await state.supabase
      .from("client_group_members")
      .delete()
      .eq("organization_id", state.organization.id)
      .eq("group_id", groupId);
    if (deleteError) throw deleteError;
  } else {
    const { data: group, error: insertError } = await state.supabase
      .from("client_groups")
      .insert({
        organization_id: state.organization.id,
        coach_id: state.session.user.id,
        name,
      })
      .select("id")
      .single();
    if (insertError) throw insertError;
    groupId = group.id;
  }

  const rows = memberIds.map((clientId) => ({
    organization_id: state.organization.id,
    group_id: groupId,
    client_id: clientId,
  }));
  const { error: memberError } = await state.supabase.from("client_group_members").insert(rows);
  if (memberError) throw memberError;

  state.groupEditor = null;
  state.message = "Gruppe wurde gespeichert.";
  await loadWorkspaceData();
  renderApp();
}

async function deleteGroup(groupId, groupName) {
  const confirmed = window.confirm(`Gruppe "${groupName}" löschen?\n\nDie Clients bleiben erhalten, nur die Gruppe wird entfernt.`);
  if (!confirmed) return;

  const { error } = await state.supabase
    .from("client_groups")
    .delete()
    .eq("organization_id", state.organization.id)
    .eq("id", groupId);
  if (error) throw error;

  state.selectedTaskGroupIds = state.selectedTaskGroupIds.filter((id) => id !== groupId);
  if (state.groupEditor?.groupId === groupId) state.groupEditor = null;
  state.message = "Gruppe wurde gelöscht.";
  await loadWorkspaceData();
  renderApp();
}

async function createInvite(values) {
  const { data, error } = await state.supabase.rpc("create_invitation", {
    org_id: state.organization.id,
    invite_email: values.email,
    invite_role: values.role,
    client_coach: state.session.user.id,
  });
  if (error) {
    const message = String(error.message || "");
    if (message.includes("CLIENT_LIMIT_REACHED")) {
      const limit = message.split(":").pop() || state.settings?.client_limit || 10;
      throw new Error(
        `Das Testlimit von ${limit} Clients ist erreicht. Für weitere Clients muss dieser Workspace freigeschaltet werden.`
      );
    }
    throw error;
  }
  await loadWorkspaceData();
  const createdInvite = state.invitations.find((invite) => invite.code === data);
  state.lastInviteId = createdInvite?.id || "";
  state.inviteModalId = createdInvite?.id || "";
  state.message = "Einladung wurde erstellt. Wähle jetzt, wie du sie versenden möchtest.";
  renderApp();
}

function buildInviteUrl(code, email, role = "") {
  const url = new URL(window.location.href);
  url.search = "";
  url.searchParams.set("email", email);
  if (role) {
    url.searchParams.set("role", role);
  }
  return url.toString();
}

function openInviteEmail(invite) {
  const inviteUrl = buildInviteUrl(invite.code, invite.email, invite.role);
  const { subject, body } = inviteMessage(invite, inviteUrl);
  window.location.href = `mailto:${encodeURIComponent(invite.email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function inviteOpeningLine(invite) {
  if (invite.role !== "client") {
    const coachTexts = {
      generic_coaching:
        "Mit Moment:um kannst du deine Clients zwischen Gesprächen mit kleinen Aufgaben, Impulsen und Reflexionen begleiten. So bleibt das, was ihr besprecht, auch im Alltag in Bewegung.",
      psychotherapy:
        "Mit Moment:um kannst du Klient:innen zwischen Sitzungen mit Übungen, Reflexionsimpulsen und sanfter Struktur begleiten. So bleibt das, was ihr besprecht, auch im Alltag in Bewegung.",
      physiotherapy:
        "Mit Moment:um kannst du Patient:innen zwischen Terminen mit Heimübungen, kurzen Rückmeldungen und Verlauf im Blick begleiten. So bleibt das, was ihr besprecht, auch im Alltag in Bewegung.",
      football:
        "Mit Moment:um kannst du Spieler:innen zwischen Trainings mit Trainingsaufgaben, Wochenzielen und Reflexionen begleiten. So bleibt das, was ihr trainiert, auch zwischen den Einheiten in Bewegung.",
      martial_arts:
        "Mit Moment:um kannst du Sportler:innen zwischen Einheiten mit Technikaufgaben, Fokusimpulsen und Reflexionen begleiten. So bleibt das, was ihr trainiert, auch zwischen den Einheiten in Bewegung.",
      dog_training:
        "Mit Moment:um kannst du Halter:innen zwischen Einheiten mit Trainingsplänen, Beobachtungsaufgaben und kurzen Reflexionen begleiten. So bleibt das, was ihr übt, auch im Alltag in Bewegung.",
      nutrition:
        "Mit Moment:um kannst du Clients zwischen Terminen mit Ernährungszielen, Gewohnheitsimpulsen und kurzen Check-ins begleiten. So bleibt das, was ihr besprecht, auch im Alltag in Bewegung.",
    };

    return coachTexts[state.organization?.industry_preset_id] || coachTexts.generic_coaching;
  }

  const texts = {
    generic_coaching:
      "Hier bekommst du kleine Aufgaben und Impulse für die Zeit zwischen euren Gesprächen. So bleibt das, was ihr besprecht, auch im Alltag in Bewegung.",
    psychotherapy:
      "Hier bekommst du Übungen und Reflexionsimpulse für die Zeit zwischen den Sitzungen. So bleibt das, was ihr besprecht, auch im Alltag in Bewegung.",
    physiotherapy:
      "Hier bekommst du Heimübungen und kurze Rückfragen für die Zeit zwischen deinen Terminen. So bleibt das, was ihr besprecht, auch im Alltag in Bewegung.",
    football:
      "Hier bekommst du Trainingsaufgaben und Wochenziele für die Zeit zwischen den Trainings. So bleibt das, was ihr besprecht, auch im Alltag in Bewegung.",
    martial_arts:
      "Hier bekommst du Technikaufgaben, Fokusimpulse und kurze Reflexionen für die Zeit zwischen den Trainings. So bleibt das, was ihr übt, auch zwischen den Einheiten in Bewegung.",
    dog_training:
      "Hier bekommst du Trainingspläne und Beobachtungsaufgaben für den Alltag mit deinem Hund. So bleibt das, was ihr besprecht, auch im Alltag in Bewegung.",
    nutrition:
      "Hier bekommst du Ernährungsziele und kleine Gewohnheitsimpulse für die Zeit zwischen den Terminen. So bleibt das, was ihr besprecht, auch im Alltag in Bewegung.",
  };

  return texts[state.organization?.industry_preset_id] || texts.generic_coaching;
}

function inviteEmoji(invite) {
  return {
    generic_coaching: " 💬",
    psychotherapy: " 🌿",
    physiotherapy: " 🧘",
    football: " ⚽",
    martial_arts: " 🥋",
    dog_training: " 🐾",
    nutrition: " 🥗",
  }[state.organization?.industry_preset_id] || " 💬";
}

function inviteTargetLabel() {
  return {
    generic_coaching: "Clients",
    psychotherapy: "Klient:innen",
    physiotherapy: "Patient:innen",
    football: "Spieler:innen",
    martial_arts: "Sportler:innen",
    dog_training: "Halter:innen",
    nutrition: "Clients",
  }[state.organization?.industry_preset_id] || "Clients";
}

function inviteMessage(invite, inviteUrl) {
  const isClientInvite = invite.role === "client";
  const accessLine = isClientInvite
    ? "Nach dem Öffnen des Links kannst du deinen Zugang erstellen."
    : `Beim Erstellen deines Zugangs legst du Name, Passwort, Firmenname und Branche fest. Danach bekommst du deinen eigenen Workspace und kannst deine ${inviteTargetLabel()} einladen.`;

  return {
    email: invite.email,
    subject: "Einladung zu Moment:um",
    body: [
      "Hallo,",
      "",
      `du wurdest zu Moment:um eingeladen.${inviteEmoji(invite)}`,
      "",
      inviteOpeningLine(invite),
      "",
      `Bitte öffne diesen Link: ${inviteUrl}`,
      "",
      `Dein Einladungscode lautet: ${invite.code}`,
      "",
      accessLine,
      "",
      "Nimm das Moment:um mit! Die wichtigsten Fortschritte entstehen zwischen den Sessions.",
      "",
      "Liebe Grüße",
      "Das Moment:um Team",
    ].join("\n"),
  };
}

function openWebmail(provider, invite) {
  const inviteUrl = buildInviteUrl(invite.code, invite.email, invite.role);
  const { subject, body } = inviteMessage(invite, inviteUrl);
  const encoded = {
    to: encodeURIComponent(invite.email),
    subject: encodeURIComponent(subject),
    body: encodeURIComponent(body),
  };

  const urls = {
    gmail: `https://mail.google.com/mail/?view=cm&fs=1&to=${encoded.to}&su=${encoded.subject}&body=${encoded.body}`,
    outlook: `https://outlook.live.com/mail/0/deeplink/compose?to=${encoded.to}&subject=${encoded.subject}&body=${encoded.body}`,
    yahoo: `https://compose.mail.yahoo.com/?to=${encoded.to}&subject=${encoded.subject}&body=${encoded.body}`,
    gmx: "https://www.gmx.net/mail/",
    webde: "https://web.de/email/",
  };

  if (provider === "gmx" || provider === "webde") {
    copyInvite(invite, true);
  }

  window.open(urls[provider], "_blank", "noopener,noreferrer");
}

async function copyInvite(invite, silent = false) {
  const inviteUrl = buildInviteUrl(invite.code, invite.email, invite.role);
  const { subject, body } = inviteMessage(invite, inviteUrl);
  const text = `An: ${invite.email}\nBetreff: ${subject}\n\n${body}`;

  try {
    await navigator.clipboard.writeText(text);
    if (!silent) {
      state.message = "Einladungstext wurde kopiert.";
      renderApp();
    }
  } catch {
    window.prompt("Einladungstext kopieren:", text);
  }
}

async function shareInvite(invite) {
  const inviteUrl = buildInviteUrl(invite.code, invite.email, invite.role);
  const { subject, body } = inviteMessage(invite, inviteUrl);
  const text = `An: ${invite.email}\n\n${body}`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: subject,
        text,
      });
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }

  await copyInvite(invite);
}

function reminderMessage(row) {
  const taskLines = row.tasks
    .map((task) => {
      const overdue = isOverdue(task) ? "überfällig" : "offen";
      return `- ${task.title} (fällig ${formatDate(task.due_date)}, ${overdue})`;
    })
    .join("\n");
  const copy = reminderCopy();

  return {
    email: row.clientEmail,
    subject: copy.subject,
    body: [
      `Hallo ${row.clientName},`,
      "",
      copy.intro,
      "",
      copy.body,
      "",
      "Offene Aufgaben:",
      taskLines,
      "",
      "Bleib in deinem Moment:um – die wichtigsten Fortschritte entstehen zwischen den Sessions.",
      "",
      "Liebe Grüße",
      "Das Moment:um Team",
    ].join("\n"),
  };
}

function reminderCopy() {
  const copies = {
    generic_coaching: {
      subject: "Erinnerung: Deine nächsten Schritte warten",
      intro: "du hast noch offene Aufgaben in Moment:um 💬",
      body:
        "Deine nächsten Schritte warten bereits auf dich. Jede Umsetzung hilft dir dabei, neue Erkenntnisse in die Praxis zu bringen und deine Ziele Schritt für Schritt zu verfolgen.",
    },
    psychotherapy: {
      subject: "Erinnerung: Deine Reflexion wartet auf dich",
      intro: "du hast noch offene Aufgaben in Moment:um 🌿",
      body:
        "Veränderungen entstehen oft in der Zeit zwischen den Sitzungen. Deine Übungen und Reflexionen helfen dir dabei, neue Erkenntnisse in deinen Alltag zu integrieren und bewusster wahrzunehmen, was sich entwickelt.",
    },
    physiotherapy: {
      subject: "Erinnerung: Bleib in Bewegung",
      intro: "du hast noch offene Aufgaben in Moment:um 🧘",
      body:
        "Regelmäßige Übungen sind ein wichtiger Teil deines Fortschritts. Bleib dran und unterstütze deinen Körper dabei, Kraft, Beweglichkeit und Stabilität weiter aufzubauen.",
    },
    football: {
      subject: "Erinnerung: Arbeite an deinem nächsten Entwicklungsschritt",
      intro: "du hast noch offene Aufgaben in Moment:um ⚽",
      body:
        "Die entscheidenden Entwicklungsschritte passieren oft zwischen den Trainingseinheiten. Nutze die Zeit, um an deinen Fähigkeiten zu arbeiten und deinem nächsten Ziel näherzukommen.",
    },
    martial_arts: {
      subject: "Erinnerung: Bleib fokussiert in deinem Training",
      intro: "du hast noch offene Aufgaben in Moment:um 🥋",
      body:
        "Konstante Entwicklung entsteht durch saubere Wiederholung, Aufmerksamkeit und Fokus. Bleib dran und nutze die Zeit zwischen den Einheiten, um Technik, Körpergefühl und Haltung zu stärken.",
    },
    dog_training: {
      subject: "Erinnerung: Zeit für eure nächste Übung",
      intro: "du hast noch offene Aufgaben in Moment:um 🐾",
      body:
        "Konsequentes Training im Alltag macht den Unterschied. Jede Übung stärkt das Gelernte und hilft euch dabei, gemeinsam Fortschritte zu machen.",
    },
    nutrition: {
      subject: "Erinnerung: Dein nächster Schritt zählt",
      intro: "du hast noch offene Aufgaben in Moment:um. 🥗",
      body:
        "Nachhaltige Veränderungen entstehen durch viele kleine Entscheidungen. Bleib dran und arbeite Schritt für Schritt an deinen persönlichen Zielen.",
    },
  };

  return copies[state.organization?.industry_preset_id] || copies.generic_coaching;
}

function openReminderEmail(row) {
  const { subject, body } = reminderMessage(row);
  window.location.href = `mailto:${encodeURIComponent(row.clientEmail)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function openReminderWebmail(provider, row) {
  const { subject, body } = reminderMessage(row);
  const encoded = {
    to: encodeURIComponent(row.clientEmail),
    subject: encodeURIComponent(subject),
    body: encodeURIComponent(body),
  };

  const urls = {
    gmail: `https://mail.google.com/mail/?view=cm&fs=1&to=${encoded.to}&su=${encoded.subject}&body=${encoded.body}`,
    outlook: `https://outlook.live.com/mail/0/deeplink/compose?to=${encoded.to}&subject=${encoded.subject}&body=${encoded.body}`,
    yahoo: `https://compose.mail.yahoo.com/?to=${encoded.to}&subject=${encoded.subject}&body=${encoded.body}`,
    gmx: "https://www.gmx.net/mail/",
    webde: "https://web.de/email/",
  };

  if (provider === "gmx" || provider === "webde") {
    copyReminder(row, true);
  }

  window.open(urls[provider], "_blank", "noopener,noreferrer");
}

async function shareReminder(row) {
  const { subject, body } = reminderMessage(row);
  const text = `An: ${row.clientEmail}\n\n${body}`;

  if (navigator.share) {
    try {
      await navigator.share({
        title: subject,
        text,
      });
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }

  await copyReminder(row);
}

async function copyReminder(row, silent = false) {
  const { subject, body } = reminderMessage(row);
  const text = `An: ${row.clientEmail}\nBetreff: ${subject}\n\n${body}`;

  try {
    await navigator.clipboard.writeText(text);
    if (!silent) {
      state.message = "Erinnerungstext wurde kopiert.";
      renderApp();
    }
  } catch {
    window.prompt("Erinnerungstext kopieren:", text);
  }
}

async function uploadBrandAsset(file, folder) {
  if (!file || file.size <= 0) return "";

  const safeName = file.name.toLowerCase().replace(/[^a-z0-9.]+/g, "-");
  const path = `${state.organization.id}/${folder}/${Date.now()}-${safeName}`;
  const { error: uploadError } = await state.supabase.storage
    .from("brand-assets")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type,
    });
  if (uploadError) throw uploadError;
  const { data } = state.supabase.storage.from("brand-assets").getPublicUrl(path);
  return data.publicUrl;
}

async function saveSettings(values) {
  const presetId = values.preset || state.organization.industry_preset_id;
  let logoUrl = values.logo_url || "";
  const logoFile = values.logo_file;
  let heroImageUrl = customHeroImageForPreset(presetId);
  const heroFile = values.hero_file;

  if (values.remove_logo === "true") {
    logoUrl = "";
  }

  if (values.remove_hero_image === "true") {
    heroImageUrl = "";
  }

  if (logoFile && logoFile.size > 0) {
    logoUrl = await uploadBrandAsset(logoFile, "logos");
  }

  if (heroFile && heroFile.size > 0) {
    heroImageUrl = await uploadBrandAsset(heroFile, "hero-images");
  }

  if (isPlatformOwner() && presetId && presetId !== state.organization.industry_preset_id) {
    const { error: presetError } = await state.supabase.rpc("update_workspace_preset", {
      org_id: state.organization.id,
      preset_id: presetId,
    });
    if (presetError) throw presetError;
  }

  const brandProfiles = {
    ...(state.settings?.brand_profiles || {}),
    [presetId]: {
      display_name: values.display_name,
      logo_text: values.logo_text,
      logo_url: logoUrl,
      hero_image_url: heroImageUrl,
      primary_color: values.primary_color,
      secondary_color: values.secondary_color,
    },
  };

  const { error } = await state.supabase
    .from("organization_settings")
    .update({
      display_name: values.display_name,
      logo_text: values.logo_text,
      logo_url: logoUrl,
      hero_image_url: heroImageUrl,
      primary_color: values.primary_color,
      secondary_color: values.secondary_color,
      brand_profiles: brandProfiles,
    })
    .eq("organization_id", state.organization.id);
  if (error) throw error;
  state.message = "Branding für diese Branche gespeichert.";
  await loadMemberships();
  renderApp();
}

async function createTemplate(values) {
  const { error } = await state.supabase.from("task_templates").insert({
    organization_id: state.organization.id,
    preset_id: state.organization.industry_preset_id,
    title: values.title,
    description: richTextToHtml(values.description),
    created_by: state.session.user.id,
  });
  if (error) throw error;

  state.message = "Template gespeichert.";
  await loadWorkspaceData();
  renderApp();
}

async function deleteTemplate(templateId) {
  const confirmed = window.confirm("Dieses Template löschen?");
  if (!confirmed) return;

  const { error } = await state.supabase
    .from("task_templates")
    .delete()
    .eq("id", templateId)
    .eq("organization_id", state.organization.id);
  if (error) throw error;

  state.message = "Template gelöscht.";
  await loadWorkspaceData();
  renderApp();
}

async function updateTemplate(values) {
  const { error } = await state.supabase
    .from("task_templates")
    .update({
      title: values.title,
      description: richTextToHtml(values.description),
    })
    .eq("id", values.id)
    .eq("organization_id", state.organization.id);
  if (error) throw error;

  state.editingTemplateId = "";
  state.message = "Template aktualisiert.";
  await loadWorkspaceData();
  renderApp();
}

async function createNote(values) {
  const { error } = await state.supabase.from("coach_notes").insert({
    organization_id: state.organization.id,
    coach_id: state.session.user.id,
    client_id: values.client_id,
    text: richTextToHtml(values.text),
  });
  if (error) throw error;
  state.message = "Private Notiz gespeichert.";
  await loadWorkspaceData();
  renderApp();
}

async function removeClient(clientId, clientName) {
  const confirmed = window.confirm(
    `${clientName} aus diesem Workspace entfernen?\n\nDer Zugriff wird entzogen, offene Aufgaben und offene Einladungen werden gelöscht. Erledigte Aufgaben, Reflexionen und private Notizen bleiben als Verlauf für dich erhalten.`,
  );
  if (!confirmed) return;

  const { error } = await state.supabase.rpc("remove_client_from_workspace", {
    org_id: state.organization.id,
    removed_client_id: clientId,
  });
  if (error) throw error;

  state.selectedClientId = "";
  state.view = "clients";
  state.message = "Client wurde entfernt. Zugriff, offene Aufgaben und offene Einladungen wurden bereinigt.";
  await loadWorkspaceData();
  renderApp();
}

async function completeTask(values) {
  const files = values.attachment_files || [];
  if (!values.text || !values.mood) {
    throw new Error("Bitte Reflexion und Status ausfüllen.");
  }

  if (files.length) {
    await ensureAttachmentSupport();
  }

  const reflectionText = richTextToHtml(values.text);

  if (!files.length) {
    const { error } = await state.supabase.rpc("complete_task", {
      task_id: state.modalTask.id,
      reflection_text: reflectionText,
      reflection_mood: values.mood,
    });
    if (error) throw error;
  } else {
    let reflectionId = "";
    try {
      const { data, error } = await state.supabase.rpc("create_reflection_for_task", {
        task_id: state.modalTask.id,
        reflection_text: reflectionText,
        reflection_mood: values.mood,
      });
      if (error) throw error;
      reflectionId = data;
      if (!reflectionId) {
        throw new Error("Die Reflexion konnte nicht vorbereitet werden. Bitte Supabase-SQL aktualisieren.");
      }

      await uploadAttachments(files, state.modalTask.id, reflectionId);

      const { error: finishError } = await state.supabase.rpc("finish_task_after_reflection", {
        task_id: state.modalTask.id,
        reflection_id: reflectionId,
      });
      if (finishError) throw finishError;
    } catch (error) {
      if (reflectionId) {
        try {
          await state.supabase.rpc("delete_reflection_draft", { reflection_id: reflectionId });
        } catch {
          // Keep the original upload error visible to the client.
        }
      }
      throw new Error(readableUploadError(error));
    }
  }

  state.modalTask = null;
  state.message = "Aufgabe abgeschlossen.";
  await loadWorkspaceData();
  renderApp();
}

async function logout() {
  await state.supabase.auth.signOut();
  resetNavigationState();
  state.session = null;
  state.organization = null;
  renderAuth();
}

async function logoutKeepInvite() {
  await state.supabase.auth.signOut();
  resetNavigationState();
  state.session = null;
  state.organization = null;
  renderAuth();
}

app.addEventListener("submit", handleSubmit);

app.addEventListener("input", (event) => {
  const inviteInput = event.target.closest("[data-invite-code]");
  if (inviteInput) {
    const form = inviteInput.closest("form");
    state.inviteInfo = null;
    clearTimeout(state.inviteLookupTimer);
    state.inviteLookupTimer = setTimeout(async () => {
      try {
        await detectInviteFromForm(form);
      } catch {
        // Keep typing smooth; submit still shows a precise validation error.
      }
    }, 350);
    return;
  }

  const directoryInput = event.target.closest("[data-client-directory-search]");
  if (directoryInput) {
    state.clientDirectorySearch = directoryInput.value;
    refreshClientDirectory();
    return;
  }

  const groupSearch = event.target.closest("[data-group-member-search]");
  if (groupSearch && state.groupEditor) {
    state.groupEditor.search = groupSearch.value;
    refreshGroupModal();
    return;
  }

  const input = event.target.closest("[data-client-search]");
  if (!input) return;
  state.clientSearch = input.value;
  state.clientPickerOpen = true;
  refreshClientPicker();
});

app.addEventListener("focusin", (event) => {
  if (!event.target.closest("[data-client-search]")) return;
  if (state.clientPickerOpen) return;
  state.clientPickerOpen = true;
  refreshClientPicker();
});

app.addEventListener("input", (event) => {
  const editor = event.target.closest("[data-rich-editor]");
  if (editor) syncRichEditor(editor);
});

app.addEventListener("paste", (event) => {
  const editor = event.target.closest("[data-rich-editor]");
  if (!editor) return;
  event.preventDefault();
  document.execCommand("insertHTML", false, normalizedPasteHtml(event));
  syncRichEditor(editor);
});

app.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && state.batchModalId) {
    state.batchModalId = "";
    renderApp();
    return;
  }

  if (event.key === "Escape" && state.groupEditor) {
    state.groupEditor = null;
    renderApp();
    return;
  }

  if (event.key === "Escape" && state.readerModal) {
    state.readerModal = null;
    renderApp();
    return;
  }

  const editor = event.target.closest("[data-rich-editor]");
  if (!editor) {
    const readable = event.target.closest("[data-open-reader]");
    if (readable && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      state.readerModal = readable.dataset.openReader;
      renderApp();
    }
    return;
  }
  if (event.key !== "Tab") return;
  event.preventDefault();
  document.execCommand(event.shiftKey ? "outdent" : "insertHTML", false, event.shiftKey ? null : "&emsp;");
  syncRichEditor(editor);
});

app.addEventListener("change", async (event) => {
  const blockSelect = event.target.closest("[data-rich-block]");
  if (blockSelect) {
    applyRichCommand(blockSelect, "formatBlock", blockSelect.value);
    return;
  }

  const colorInput = event.target.closest("[data-rich-color]");
  if (colorInput) {
    applyRichCommand(colorInput, "foreColor", colorInput.value);
    return;
  }

  const fileInput = event.target.closest("[data-file-input]");
  if (fileInput) {
    renderSelectedFiles(fileInput);
    return;
  }

  const workspaceSwitch = event.target.closest("[data-workspace-switch]");
  if (workspaceSwitch) {
    try {
      rememberActiveWorkspace(workspaceSwitch.value);
      resetNavigationState();
      await loadMemberships();
      await loadWorkspaceData();
      state.message = "Workspace gewechselt.";
      renderApp();
    } catch (error) {
      state.error = error.message;
      renderApp();
    }
    return;
  }

  const presetSwitch = event.target.closest("[data-preset-switch]");
  if (presetSwitch) {
    try {
      const { error } = await state.supabase.rpc("update_workspace_preset", {
        org_id: state.organization.id,
        preset_id: presetSwitch.value,
      });
      if (error) throw error;
      state.message = "Branche gewechselt. Du bearbeitest jetzt das Branding dieser Branche.";
      await loadMemberships();
      await loadWorkspaceData();
      renderApp();
    } catch (error) {
      state.error = error.message;
      renderApp();
    }
    return;
  }

  const groupCheckbox = event.target.closest("[data-group-member-checkbox]");
  if (groupCheckbox && state.groupEditor) {
    const selected = new Set(state.groupEditor.selectedIds);
    if (groupCheckbox.checked) {
      selected.add(groupCheckbox.value);
    } else {
      selected.delete(groupCheckbox.value);
    }
    state.groupEditor.selectedIds = [...selected];
    refreshGroupModal({ focusSearch: false });
    return;
  }

  const groupSelect = event.target.closest("[data-task-group-select]");
  if (groupSelect) {
    const groupId = groupSelect.value || "";
    if (groupId) {
      const members = groupMembers(groupId);
      if (members.length < 2) {
        state.error = "Diese Gruppe braucht mindestens zwei Personen.";
        renderApp();
        return;
      }
      state.selectedTaskGroupIds = [...new Set([...state.selectedTaskGroupIds, groupId])];
      refreshTaskGroupPicker();
      refreshTaskRecipientSummary();
    }
    return;
  }

  const select = event.target.closest("[data-template-select]");
  if (!select) return;

  const option = select.selectedOptions[0];
  const form = select.closest("form");
  const title = form?.querySelector("[data-task-title]");
  const description = form?.querySelector("[data-task-description]");

  if (title) title.value = option?.dataset.title || "";
  if (description) setRichEditorValue(description, option?.dataset.description || "");
});

app.addEventListener("click", async (event) => {
  if (event.target.hasAttribute("data-task-composer-backdrop")) {
    state.taskComposerOpen = false;
    state.clientPickerOpen = false;
    renderApp();
    return;
  }

  if (event.target.hasAttribute("data-batch-backdrop")) {
    state.batchModalId = "";
    renderApp();
    return;
  }

  if (event.target.hasAttribute("data-group-backdrop")) {
    state.groupEditor = null;
    renderApp();
    return;
  }

  if (event.target.hasAttribute("data-reader-backdrop")) {
    state.readerModal = null;
    renderApp();
    return;
  }

  if (!event.target.closest(".client-picker") && state.clientPickerOpen) {
    state.clientPickerOpen = false;
    refreshClientPicker({ focus: false });
  }

  const readable = event.target.closest("[data-open-reader]");
  if (readable && !event.target.closest("button, a, input, select, textarea, [contenteditable='true']")) {
    state.readerModal = readable.dataset.openReader;
    renderApp();
    return;
  }

  const target = event.target.closest("button");
  if (!target) return;

  if (target.dataset.richCommand) {
    applyRichCommand(target, target.dataset.richCommand);
    return;
  }

  if (target.hasAttribute("data-rich-link")) {
    const href = window.prompt("Link einfügen");
    if (href) applyRichCommand(target, "createLink", href);
    return;
  }

  if (target.hasAttribute("data-toggle-rich-preview")) {
    const preview = target.closest("[data-rich-preview]");
    const expanded = preview?.classList.toggle("expanded");
    target.textContent = expanded ? "Weniger anzeigen" : "Mehr anzeigen";
    return;
  }

  if (target.dataset.openReader) {
    state.readerModal = target.dataset.openReader;
    state.batchModalId = "";
    renderApp();
    return;
  }

  if (target.dataset.openBatch) {
    state.batchModalId = `${target.dataset.openBatch}:${target.dataset.batchGroup || ""}`;
    renderApp();
    return;
  }

  if (target.dataset.openAttachment) {
    try {
      await openAttachment(target.dataset.openAttachment);
    } catch (error) {
      state.error = error.message;
      renderApp();
    }
    return;
  }

  if (target.hasAttribute("data-toggle-menu")) {
    state.mobileMenuOpen = !state.mobileMenuOpen;
    renderApp();
    return;
  }

  if (target.hasAttribute("data-close-menu")) {
    state.mobileMenuOpen = false;
    renderApp();
    return;
  }

  if (target.dataset.view) {
    state.view = target.dataset.view;
    state.mobileMenuOpen = false;
    state.taskComposerOpen = false;
    state.clientPickerOpen = false;
    renderApp();
  }

  if (target.dataset.filter) {
    state.filter = target.dataset.filter;
    renderApp();
  }

  if (target.dataset.complete) {
    state.modalTask = state.tasks.find((task) => task.id === target.dataset.complete);
    renderApp();
  }

  if (target.dataset.clientProfile) {
    state.selectedClientId = target.dataset.clientProfile;
    state.view = "clientProfile";
    renderApp();
  }

  if (target.dataset.readerClientProfile) {
    state.selectedClientId = target.dataset.readerClientProfile;
    state.readerModal = null;
    state.view = "clientProfile";
    renderApp();
  }

  if (target.dataset.selectTaskClient) {
    if (!state.selectedTaskClientIds.includes(target.dataset.selectTaskClient)) {
      state.selectedTaskClientIds = [...state.selectedTaskClientIds, target.dataset.selectTaskClient];
    }
    state.clientSearch = "";
    state.clientPickerOpen = true;
    refreshClientPicker();
    refreshTaskRecipientSummary();
  }

  if (target.dataset.unselectTaskClient) {
    state.selectedTaskClientIds = state.selectedTaskClientIds.filter(
      (clientId) => clientId !== target.dataset.unselectTaskClient,
    );
    state.clientPickerOpen = true;
    refreshClientPicker();
    refreshTaskRecipientSummary();
  }

  if (target.dataset.unselectTaskGroup) {
    state.selectedTaskGroupIds = state.selectedTaskGroupIds.filter((groupId) => groupId !== target.dataset.unselectTaskGroup);
    refreshTaskGroupPicker();
    refreshTaskRecipientSummary();
  }

  if (target.dataset.editGroup) {
    openGroupEditor(target.dataset.editGroup);
  }

  if (target.hasAttribute("data-toggle-all-group-members") && state.groupEditor) {
    const rows = groupEditorRows();
    const visibleIds = rows.map((item) => item.id);
    const selected = new Set(state.groupEditor.selectedIds);
    const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
    visibleIds.forEach((id) => {
      if (allVisibleSelected) {
        selected.delete(id);
      } else {
        selected.add(id);
      }
    });
    state.groupEditor.selectedIds = [...selected];
    refreshGroupModal({ focusSearch: false });
  }

  if (target.dataset.deleteGroup) {
    try {
      await deleteGroup(target.dataset.deleteGroup, target.dataset.groupName || "Gruppe");
    } catch (error) {
      state.error = error.message;
      renderApp();
    }
  }

  if (target.dataset.removeClient) {
    try {
      await removeClient(target.dataset.removeClient, target.dataset.clientName || "Client");
    } catch (error) {
      state.error = error.message;
      renderApp();
    }
  }

  if (target.dataset.deleteTemplate) {
    try {
      await deleteTemplate(target.dataset.deleteTemplate);
    } catch (error) {
      state.error = error.message;
      renderApp();
    }
  }

  if (target.dataset.editTemplate) {
    state.editingTemplateId = target.dataset.editTemplate;
    renderApp();
  }

  if (target.hasAttribute("data-cancel-template-edit")) {
    state.editingTemplateId = "";
    renderApp();
  }

  if (target.dataset.mailInvite) {
    const invite = state.invitations.find((item) => item.id === target.dataset.mailInvite);
    if (invite) {
      openInviteEmail(invite);
    }
  }

  if (target.dataset.selectInvite) {
    state.lastInviteId = target.dataset.selectInvite;
    state.inviteModalId = target.dataset.selectInvite;
    renderApp();
  }

  if (target.dataset.webmail) {
    const invite = state.invitations.find((item) => item.id === target.dataset.inviteId);
    if (invite) {
      openWebmail(target.dataset.webmail, invite);
    }
  }

  if (target.dataset.shareInvite) {
    const invite = state.invitations.find((item) => item.id === target.dataset.shareInvite);
    if (invite) {
      await shareInvite(invite);
    }
  }

  if (target.dataset.copyInvite) {
    const invite = state.invitations.find((item) => item.id === target.dataset.copyInvite);
    if (invite) {
      await copyInvite(invite);
    }
  }

  if (target.dataset.reminderClient) {
    state.reminderModalClientId = target.dataset.reminderClient;
    renderApp();
  }

  if (target.dataset.reminderWebmail) {
    const row = reminderRows().find((item) => item.clientId === target.dataset.clientId);
    if (row) {
      openReminderWebmail(target.dataset.reminderWebmail, row);
    }
  }

  if (target.dataset.mailReminder) {
    const row = reminderRows().find((item) => item.clientId === target.dataset.mailReminder);
    if (row) {
      openReminderEmail(row);
    }
  }

  if (target.dataset.shareReminder) {
    const row = reminderRows().find((item) => item.clientId === target.dataset.shareReminder);
    if (row) {
      await shareReminder(row);
    }
  }

  if (target.dataset.copyReminder) {
    const row = reminderRows().find((item) => item.clientId === target.dataset.copyReminder);
    if (row) {
      await copyReminder(row);
    }
  }

  if (target.dataset.action === "close-modal") {
    state.modalTask = null;
    renderApp();
  }

  if (target.dataset.action === "open-task-composer") {
    state.taskComposerOpen = true;
    state.error = "";
    renderApp();
  }

  if (target.dataset.action === "close-task-composer") {
    state.taskComposerOpen = false;
    state.clientPickerOpen = false;
    renderApp();
  }

  if (target.dataset.action === "close-reader-modal") {
    state.readerModal = null;
    renderApp();
  }

  if (target.dataset.action === "close-batch-modal") {
    state.batchModalId = "";
    renderApp();
  }

  if (target.dataset.action === "close-group-modal") {
    state.groupEditor = null;
    renderApp();
  }

  if (target.dataset.action === "close-invite-modal") {
    state.inviteModalId = "";
    renderApp();
  }

  if (target.dataset.action === "close-reminder-modal") {
    state.reminderModalClientId = "";
    renderApp();
  }

  if (target.dataset.action === "logout") {
    await logout();
  }

  if (target.dataset.action === "logout-keep-invite") {
    await logoutKeepInvite();
  }

  if (target.dataset.action === "reload") {
    await loadApp();
  }
});

init();
