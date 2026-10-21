import { $, el, fmt, icon, areaText } from "./util.js";
import { kindPlural, kindTotal, ordered, placeLine } from "./data.js";
import { fitBox, liveFonts, livePalette, plateSvg } from "./plate.js";
import { dismissHint, hintSeen, onChange, toggleVisited, visited } from "./store.js";

const MAX_ICONS = 60;
const MAX_DRAWN_RATIO = 600;

const ratioText = (ratio) => (ratio >= 10 ? fmt(Math.round(ratio)) : fmt(ratio, 1));

function rankLine(place) {
  if (!place.rank) return "";
  return `#${fmt(place.rank)} of ${fmt(kindTotal(place.kind))} ${kindPlural(place.kind).toLowerCase()}`;
}

function waffle(small, ratio) {
  let unit = 1;
  for (let power = 1; ratio / unit > MAX_ICONS; power *= 10) {
    unit = [1, 2, 5].map((m) => m * power).find((u) => ratio / u <= MAX_ICONS) ?? 10 * power;
  }
  const total = ratio / unit;
  const full = Math.floor(total);
  const frac = total - full;
  const box = fitBox(small, 1.06);
  const [bx, by, bs] = box.split(" ").map(Number);
  const icons = [];
  for (let i = 0; i < full; i++) {
    icons.push(el("svg", { viewBox: box, "aria-hidden": "true" }, el("use", { href: "#waffle-shape" })));
  }
  if (frac >= 0.05) {
    const clipId = "waffle-clip";
    icons.push(
      el(
        "svg",
        { viewBox: box, "aria-hidden": "true" },
        el("clipPath", { id: clipId }, el("rect", { x: bx, y: by, width: bs * frac, height: bs })),
        el("use", { href: "#waffle-shape", "clip-path": `url(#${clipId})` }),
      ),
    );
  }
  return { icons, unit };
}

export function initCompare(ctx) {
  const plate = $("#plate");
  const captions = $("#captions");
  const fit = $("#fit");
  const hint = $("#hint");
  let enterNext = false;

  $("#shuffle").addEventListener("click", () => ctx.shuffle());
  const shareLabel = $("#shareLabel");
  let shareTimer;
  const flash = (text) => {
    shareLabel.textContent = text;
    clearTimeout(shareTimer);
    shareTimer = setTimeout(() => (shareLabel.textContent = "Share"), 1800);
  };
  $("#share").addEventListener("click", async () => {
    const pair = ctx.getPair();
    if (!pair) return;
    const [big, small] = ordered(...pair);
    const url = `${location.origin}${location.pathname}#/compare/${encodeURIComponent(big.id)}/${encodeURIComponent(small.id)}`;
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      try {
        await navigator.share({ title: `${big.name} and ${small.name} at the same scale`, url });
        return;
      } catch (error) {
        if (error.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      flash("Link copied");
    } catch {
      flash("Copy it from the address bar");
    }
  });
  plate.addEventListener("click", (event) => {
    const role = event.target.closest("[data-role]")?.dataset.role;
    const pair = ctx.getPair();
    if (role && pair) ctx.openPlace(role === "big" ? pair[0] : pair[1]);
  });
  $("#hintClose").addEventListener("click", () => {
    dismissHint();
    hint.hidden = true;
  });
  hint.hidden = hintSeen();

  new ResizeObserver(() => draw()).observe(plate);
  onChange(() => draw());

  function caption(place, index) {
    const id = place.id;
    const been = visited.has(id);
    const area = areaText(place.km2);
    return el(
      "article",
      { class: "caption" },
      el("span", { class: "numeral", "aria-hidden": "true" }, String(index + 1)),
      el(
        "div",
        { class: "caption-body" },
        el("h2", {}, el("button", { type: "button", class: "name-btn", onclick: () => ctx.openPlace(place) }, place.name)),
        el("p", { class: "caption-meta" }, placeLine(place)),
        el("p", { class: "caption-stat" }, `${areaText(place.acres)} acres`, el("span", {}, `${area} km²`)),
        rankLine(place) ? el("p", { class: "caption-rank" }, rankLine(place)) : null,
      ),
      el(
        "div",
        { class: "caption-actions" },
        el("button", { type: "button", class: "text-btn", onclick: () => ctx.openChooser(place) }, "Change"),
        el(
          "button",
          { type: "button", class: "stamp", "aria-pressed": String(been), onclick: () => toggleVisited(id) },
          icon("check"),
          been ? "Been here" : "Mark visited",
        ),
      ),
    );
  }

  function draw() {
    const pair = ctx.getPair();
    if (!pair) return;
    const [big, small] = ordered(...pair);
    const width = Math.round(plate.clientWidth);
    const height = Math.round(plate.clientHeight);
    if (width < 80 || height < 80) return;

    plate.innerHTML = plateSvg({ big, small, width, height, pal: livePalette, fonts: liveFonts, seed: `${big.id}${small.id}` });
    if (enterNext) {
      plate.classList.remove("enter");
      void plate.offsetWidth;
      plate.classList.add("enter");
      enterNext = false;
    }

    captions.replaceChildren(caption(big, 0), caption(small, 1));

    const ratio = big.acres / small.acres;
    if (ratio < 1.05) {
      fit.replaceChildren(el("p", { class: "fit-line" }, `${big.name} and ${small.name} are about the same size.`));
      return;
    }
    const ratioEl = el("p", { class: "fit-ratio" }, el("strong", {}, `${ratioText(ratio)}×`));
    const line = `${big.name} is ${ratioText(ratio)} times the size of ${small.name}.`;
    if (ratio > MAX_DRAWN_RATIO) {
      fit.replaceChildren(ratioEl, el("p", { class: "fit-line" }, line, el("span", { class: "fit-unit" }, " That's too many to draw.")));
      return;
    }
    $("#waffle-shape").setAttribute("d", small.shape.d);
    const { icons, unit } = waffle(small, ratio);
    fit.replaceChildren(
      ratioEl,
      el("div", { class: "waffle", role: "img", "aria-label": `${ratioText(ratio)} copies of ${small.name}` }, ...icons),
      el("p", { class: "fit-line" }, line, unit > 1 ? el("span", { class: "fit-unit" }, ` Each shape stands for ${fmt(unit)}.`) : null),
    );
  }

  return {
    draw,
    animateNext() {
      enterNext = true;
    },
  };
}
