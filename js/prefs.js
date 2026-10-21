import { $, $$ } from "./util.js";
import { getFont, getThemePref, onChange, setFont, setThemePref } from "./store.js";

export function initPrefs() {
  const panel = $("#prefs");
  const button = $("#prefsBtn");
  const form = $("#prefsForm");

  const sync = () => {
    const current = { theme: getThemePref(), font: getFont() };
    $$("input", form).forEach((input) => {
      input.checked = input.value === current[input.name];
    });
  };

  form.addEventListener("change", (event) => {
    const { name, value } = event.target;
    if (name === "theme") setThemePref(value);
    if (name === "font") setFont(value);
  });

  const place = () => {
    const box = button.getBoundingClientRect();
    panel.style.top = `${Math.round(box.bottom + 8)}px`;
    panel.style.right = `${Math.max(8, Math.round(innerWidth - box.right))}px`;
  };

  if ("showPopover" in panel) {
    panel.addEventListener("beforetoggle", (event) => {
      if (event.newState === "open") {
        sync();
        place();
      }
    });
  } else {
    // Browsers without the Popover API get a plain toggle.
    panel.hidden = true;
    button.removeAttribute("popovertarget");
    button.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
      if (!panel.hidden) {
        sync();
        place();
        panel.style.display = "block";
      }
      button.setAttribute("aria-expanded", String(!panel.hidden));
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !panel.hidden) {
        panel.hidden = true;
        button.setAttribute("aria-expanded", "false");
        button.focus();
      }
    });
  }

  addEventListener("resize", () => panel.matches(":popover-open") && place());
  onChange(sync);
  sync();
}
