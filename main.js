"use strict";

const {
  Plugin,
  PluginSettingTab,
  Setting,
  MarkdownView,
  moment,
  setIcon,
} = require("obsidian");

const WRAPPER_CLASS = "dowp-wrapper";

const DEFAULT_RULE = {
  folder: "",
  source: "filename", // "filename" | "property"
  property: "date",
  inputFormat: "YYYY-MM-DD",
  label: "Day of the week",
  outputFormat: "dddd",
  position: "bottom", // "top" | "bottom"
  icon: "calendar-days",
};

const DEFAULT_SETTINGS = {
  rules: [{ ...DEFAULT_RULE }],
};

function normalizeFolder(folder) {
  return (folder || "").trim().replace(/\\/g, "/").replace(/^\/+|\/+$/g, "");
}

module.exports = class DayOfWeekPropertyPlugin extends Plugin {
  async onload() {
    await this.loadSettings();
    this.observers = new Map(); // view -> MutationObserver
    this.pending = new WeakSet(); // views with a scheduled sync

    this.addSettingTab(new DayOfWeekSettingTab(this.app, this));

    const refresh = () => this.refreshAll();
    this.registerEvent(this.app.workspace.on("layout-change", refresh));
    this.registerEvent(this.app.workspace.on("file-open", refresh));
    this.registerEvent(this.app.workspace.on("active-leaf-change", refresh));
    this.registerEvent(this.app.metadataCache.on("changed", refresh));
    this.registerEvent(this.app.vault.on("rename", refresh));
    this.app.workspace.onLayoutReady(refresh);
  }

  onunload() {
    for (const observer of this.observers.values()) observer.disconnect();
    this.observers.clear();
    document.querySelectorAll("." + WRAPPER_CLASS).forEach((el) => el.remove());
  }

  async loadSettings() {
    const data = (await this.loadData()) || {};
    const rules = Array.isArray(data.rules) ? data.rules : DEFAULT_SETTINGS.rules;
    this.settings = { rules: rules.map((r) => ({ ...DEFAULT_RULE, ...r })) };
  }

  async saveSettings() {
    await this.saveData(this.settings);
    this.refreshAll(true);
  }

  // --- date logic ---------------------------------------------------------

  /** Returns { rule, text } for the first rule that applies to this file, else null. */
  resolve(file) {
    if (!file) return null;
    for (const rule of this.settings.rules) {
      const folder = normalizeFolder(rule.folder);
      if (folder && !file.path.startsWith(folder + "/")) continue;
      const text = this.computeText(file, rule);
      if (text) return { rule, text };
    }
    return null;
  }

  computeText(file, rule) {
    let m;
    if (rule.source === "property") {
      const fm = this.app.metadataCache.getFileCache(file)?.frontmatter;
      let raw = fm?.[rule.property];
      if (Array.isArray(raw)) raw = raw[0];
      if (raw === undefined || raw === null || raw === "") return null;
      m = rule.inputFormat
        ? moment(String(raw), rule.inputFormat)
        : moment(String(raw), moment.ISO_8601);
    } else {
      m = moment(file.basename, rule.inputFormat || "YYYY-MM-DD", true);
    }
    return m.isValid() ? m.format(rule.outputFormat || "dddd") : null;
  }

  // --- DOM injection --------------------------------------------------------

  refreshAll(force = false) {
    const seen = new Set();
    this.app.workspace.iterateAllLeaves((leaf) => {
      const view = leaf.view;
      if (!(view instanceof MarkdownView)) return;
      seen.add(view);
      this.attach(view);
      this.sync(view);
    });
    // Drop observers for views that no longer exist.
    for (const [view, observer] of this.observers) {
      if (!seen.has(view)) {
        observer.disconnect();
        this.observers.delete(view);
      }
    }
    if (force) {
      // Rebuild rows so changed settings (label, icon, position) take effect.
      document.querySelectorAll("." + WRAPPER_CLASS).forEach((el) => el.remove());
      seen.forEach((view) => this.sync(view));
    }
  }

  attach(view) {
    if (this.observers.has(view)) return;
    const observer = new MutationObserver(() => this.schedule(view));
    observer.observe(view.containerEl, { childList: true, subtree: true });
    this.observers.set(view, observer);
  }

  schedule(view) {
    if (this.pending.has(view)) return;
    this.pending.add(view);
    requestAnimationFrame(() => {
      this.pending.delete(view);
      this.sync(view);
    });
  }

  sync(view) {
    const result = this.resolve(view.file);
    const hosts = view.containerEl.querySelectorAll(
      ".metadata-container .metadata-properties"
    );
    hosts.forEach((host) => this.syncHost(host, result));
    if (!hosts.length) {
      view.containerEl
        .querySelectorAll("." + WRAPPER_CLASS)
        .forEach((el) => el.remove());
    }
  }

  syncHost(host, result) {
    const parent = host.parentElement;
    if (!parent) return;
    let wrapper = parent.querySelector(":scope > ." + WRAPPER_CLASS);

    if (!result) {
      if (wrapper) wrapper.remove();
      return;
    }

    const { rule, text } = result;
    const signature = [rule.label, rule.icon, text].join("\u0000");

    if (!wrapper || wrapper.dataset.signature !== signature) {
      if (wrapper) wrapper.remove();
      wrapper = this.buildRow(rule, text);
      wrapper.dataset.signature = signature;
    }

    const wantAfter = rule.position !== "top";
    const inPlace = wantAfter
      ? host.nextElementSibling === wrapper
      : host.previousElementSibling === wrapper;
    if (!inPlace) host.insertAdjacentElement(wantAfter ? "afterend" : "beforebegin", wrapper);
  }

  buildRow(rule, text) {
    const wrapper = createDiv({ cls: WRAPPER_CLASS });
    // Mirror the markup Obsidian uses for a native text property so the
    // theme's own styling applies.
    const row = wrapper.createDiv({
      cls: "metadata-property dowp-property",
      attr: { "data-property-type": "text" },
    });
    const key = row.createDiv({ cls: "metadata-property-key" });
    const icon = key.createSpan({ cls: "metadata-property-icon" });
    setIcon(icon, rule.icon || "calendar-days");
    key.createEl("input", {
      cls: "metadata-property-key-input dowp-key",
      attr: {
        type: "text",
        readonly: "",
        tabindex: "-1",
        "aria-label": rule.label || "Day of the week",
      },
    }).value = rule.label || "Day of the week";
    const value = row.createDiv({ cls: "metadata-property-value" });
    value.createDiv({ cls: "metadata-input-longtext dowp-value", text });
    return wrapper;
  }
};

// --- settings UI -------------------------------------------------------------

class DayOfWeekSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("p", {
      text:
        "Each rule adds a read-only row to the Properties panel of matching notes. " +
        "The first rule that applies to a note wins. Notes are never modified.",
      cls: "setting-item-description",
    });

    const rules = this.plugin.settings.rules;
    rules.forEach((rule, i) => this.renderRule(containerEl, rule, i));

    new Setting(containerEl).addButton((btn) =>
      btn
        .setButtonText("Add rule")
        .setCta()
        .onClick(async () => {
          rules.push({ ...DEFAULT_RULE });
          await this.plugin.saveSettings();
          this.display();
        })
    );
  }

  renderRule(containerEl, rule, index) {
    const save = () => this.plugin.saveSettings();

    new Setting(containerEl)
      .setName(`Rule ${index + 1}`)
      .setHeading()
      .addExtraButton((btn) =>
        btn
          .setIcon("trash")
          .setTooltip("Remove this rule")
          .onClick(async () => {
            this.plugin.settings.rules.splice(index, 1);
            await this.plugin.saveSettings();
            this.display();
          })
      );

    new Setting(containerEl)
      .setName("Folder")
      .setDesc(
        "Applies to notes in this folder and its subfolders. Leave blank for the whole vault."
      )
      .addText((t) =>
        t
          .setPlaceholder("journal")
          .setValue(rule.folder)
          .onChange(async (v) => {
            rule.folder = v;
            await save();
          })
      );

    new Setting(containerEl)
      .setName("Date source")
      .setDesc("Where to read the date from.")
      .addDropdown((d) =>
        d
          .addOption("filename", "File name")
          .addOption("property", "Frontmatter property")
          .setValue(rule.source)
          .onChange(async (v) => {
            rule.source = v;
            if (v === "property" && rule.inputFormat === "YYYY-MM-DD") rule.inputFormat = "";
            if (v === "filename" && !rule.inputFormat) rule.inputFormat = "YYYY-MM-DD";
            await save();
            this.display();
          })
      );

    if (rule.source === "property") {
      new Setting(containerEl)
        .setName("Property name")
        .addText((t) =>
          t
            .setPlaceholder("date")
            .setValue(rule.property)
            .onChange(async (v) => {
              rule.property = v.trim();
              await save();
            })
        );
    }

    new Setting(containerEl)
      .setName("Input date format")
      .setDesc(
        rule.source === "property"
          ? "Moment format of the property value. Leave blank for ISO 8601 (e.g. 2026-11-04T08:52:23-0600)."
          : "Moment format of the file name, parsed strictly. Notes whose names don't match get no row."
      )
      .addText((t) =>
        t
          .setPlaceholder(rule.source === "property" ? "(ISO 8601)" : "YYYY-MM-DD")
          .setValue(rule.inputFormat)
          .onChange(async (v) => {
            rule.inputFormat = v.trim();
            await save();
          })
      );

    new Setting(containerEl)
      .setName("Label")
      .setDesc("The name shown for the row.")
      .addText((t) =>
        t
          .setPlaceholder("Day of the week")
          .setValue(rule.label)
          .onChange(async (v) => {
            rule.label = v;
            await save();
          })
      );

    new Setting(containerEl)
      .setName("Output format")
      .setDesc("Moment format for the value. dddd = Wednesday, ddd = Wed, dddd, MMMM D = Wednesday, November 4.")
      .addText((t) =>
        t
          .setPlaceholder("dddd")
          .setValue(rule.outputFormat)
          .onChange(async (v) => {
            rule.outputFormat = v.trim();
            await save();
          })
      );

    new Setting(containerEl)
      .setName("Position")
      .setDesc("Show the row above or below the note's real properties.")
      .addDropdown((d) =>
        d
          .addOption("bottom", "Below properties")
          .addOption("top", "Above properties")
          .setValue(rule.position)
          .onChange(async (v) => {
            rule.position = v;
            await save();
          })
      );

    new Setting(containerEl)
      .setName("Icon")
      .setDesc("A Lucide icon name, such as calendar-days or sun.")
      .addText((t) =>
        t
          .setPlaceholder("calendar-days")
          .setValue(rule.icon)
          .onChange(async (v) => {
            rule.icon = v.trim();
            await save();
          })
      );
  }
}
