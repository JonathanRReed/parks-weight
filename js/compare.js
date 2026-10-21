import { $, el, fmt, icon } from "./util.js";
import { kindPlural, kindTotal, ordered } from "./data.js";
import { fitBox, liveFonts, livePalette, plateSvg } from "./plate.js";
import { dismissHint, hintSeen, onChange, toggleVisited, visited } from "./store.js";

const WAFFLE_STEPS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000, 10000];
const MAX_ICONS = 60;

const ratioText = (ratio) => (ratio >= 10 ? fmt(Math.round(ratio)) : fmt(ratio, 1));

function rankLine(place) {
  if (!place.rank) return "";
  return `#${fmt(place.rank)} of ${fmt(kindTotal(place.kind))} ${kindPlural(place.kind).toLowerCase()}`;
}

function waffle(small, ratio) {
  const unit = WAFFLE_STEPS.find((u) => ratio / u <= MAX_ICONS) ?? WAFFLE_STEPS.at(-1);
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
    const stat = `${fmt(place.acres)} acres · ${fmt(place.km2, place.km2 < 10 ? 1 : 0)} km²`;
    const where = [place.kind === "national_park" ? "National park" : kindPlural(place.kind).replace(/s$/, ""), place.states.join(", ")]
      .filter(Boolean)
      .join(" · ");
    return el(
      "article",
      { class: "caption" },
      el("span", { class: "numeral", "aria-hidden": "true" }, String(index + 1)),
      el(
        "div",
        { class: "caption-body" },
        el("h2", {}, el("button", { type: "button", class: "name-btn", onclick: () => ctx.openPlace(place) }, place.name)),
        el("p", { class: "caption-meta" }, where),
        el("p", { class: "caption-stat" }, stat),
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
    $("#waffle-shape").setAttribute("d", small.shape.d);
    const { icons, unit } = waffle(small, ratio);
    fit.replaceChildren(
      el("p", { class: "fit-ratio" }, el("strong", {}, `${ratioText(ratio)}×`)),
      el("div", { class: "waffle", role: "img", "aria-label": `${ratioText(ratio)} copies of ${small.name}` }, ...icons),
      el(
        "p",
        { class: "fit-line" },
        `${big.name} is ${ratioText(ratio)} times the size of ${small.name}.`,
        unit > 1 ? el("span", { class: "fit-unit" }, ` Each shape stands for ${fmt(unit)}.`) : null,
      ),
    );
  }

  return {
    draw,
    animateNext() {
      enterNext = true;
    },
  };
}
