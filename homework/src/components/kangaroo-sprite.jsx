// The homework-completion celebration sprite. Purely presentational: no
// `useAppData()`, no `src/db/` import, the same rule `HomeworkEditForm`
// follows — `CelebrationLayer` owns when and where this mounts.
//
// The silhouette is "Kangourou.svg" by Lionel Allorge, on Wikimedia Commons
// (https://commons.wikimedia.org/wiki/File:Kangourou.svg), licensed
// CC BY-SA 3.0 / GFDL 1.2+ / Free Art License. Used with its fill color
// replaced via CSS and otherwise unmodified in shape. The credit this
// license requires lives in the side panel's About section
// (src/components/side-panel.jsx), not here — do not remove it from there.
//
// It is one fused path and cannot be cut into moving limbs, which is why
// each gesture pairs a whole-body motion (on `.silhouette-group`, via
// `src/index.css`'s `.roo.gesture-*` rules) with a small abstract accent
// (`.accents`) rather than an animated arm or eye. This is purely
// decorative — `aria-hidden` — matching the same treatment
// `specs/functional-specs.md` already gives hover-revealed controls.
const ROO_PATH_D =
  "M 789.0868,676.97364 C 733.68418,671.14641 683.69548,662.60493 639.65583,638.85479 C 611.55364,623.6995 604.39664,601.8926 583.37903,559.56196 C 567.30778,527.1936 556.85431,494.55493 551.94841,461.42649 L 544.59782,411.78929 L 507.74388,389.04182 C 487.47421,376.53067 454.29109,350.08841 434.00346,330.28117 L 397.11692,294.26805 L 371.12168,307.52983 C 282.71745,352.63037 181.29552,374.21271 126.95909,359.48713 C 91.086081,349.76528 53.22223,315.30483 32.315561,273.35058 C 2.4975684,213.51367 13.433888,196.62314 47.727691,249.54748 C 59.384082,267.53635 80.68513,290.03958 95.06335,299.55463 C 161.6264,343.60398 260.9902,304.31678 345.04782,200.714 C 445.03695,77.475222 549.43912,36.387104 644.26724,82.954396 C 688.81678,104.83134 734.66483,145.03037 772.59739,195.47263 C 818.84469,256.97186 837.57816,266.81878 867.91115,245.57275 C 887.53803,231.82555 886.26757,227.66239 856.41711,207.90831 C 840.6704,197.48763 830.55133,185.76752 830.55133,177.95 C 830.55133,156.55304 854.60819,164.32425 893.82419,198.38938 C 905.50667,208.53742 921.51111,216.86867 929.38963,216.9032 C 937.26809,216.93767 956.35122,227.01193 971.7965,239.29041 C 987.24181,251.56882 1006.1562,263.57243 1013.8284,265.96495 C 1029.8525,270.96202 1037.237,280.18013 1037.3785,295.3625 C 1037.5292,311.52733 1021.2438,314.38588 990.70969,303.55425 C 972.71494,297.17077 952.98911,295.15803 934.01444,297.76917 C 908.42233,301.29101 902.57748,305.31758 885.5161,331.18065 C 862.92403,365.42753 814.24904,405.57573 793.60176,405.57573 C 783.24044,405.57573 783.45073,418.1586 759.90511,450.42938 C 717.7283,508.23559 695.45097,511.96847 670.93046,500.2161 C 661.00396,495.45841 651.82445,486.07295 650.53156,479.3595 C 648.50147,468.81808 650.98847,467.71466 668.76453,471.26985 C 695.99595,476.71613 712.62673,466.90932 719.41903,441.40011 C 730.91759,398.21576 700.54523,363.78196 665.17203,379.89903 C 631.032,395.45433 621.36731,445.3795 639.38948,513.0849 C 657.79756,582.24036 686.9097,603.96872 810.84232,641.05165 C 857.1753,654.91531 895.11373,668.44073 895.14993,671.10813 C 895.22779,676.84289 853.92686,683.7936 789.0868,676.97364 z";

// Every gesture settles on three accent elements, matching its own
// three-beat body motion. Coordinates share the silhouette's own
// ~1000-unit space; see `src/index.css` for the animations that move them.
function PopAccents() {
  return (
    <>
      <circle
        className="accent accent-burst"
        cx="520"
        cy="-40"
        r="26"
        style={{ "--dx": "-100px", "--dy": "-24px", animationDelay: "0.3s" }}
      />
      <circle
        className="accent accent-burst"
        cx="520"
        cy="-40"
        r="26"
        style={{ "--dx": "100px", "--dy": "-24px", animationDelay: "0.3s" }}
      />
      <circle
        className="accent accent-burst"
        cx="520"
        cy="-40"
        r="23"
        style={{ "--dx": "0px", "--dy": "-95px", animationDelay: "0.3s" }}
      />
    </>
  );
}

function NodAccents() {
  return (
    <>
      <path
        className="accent accent-sparkle"
        style={{ animationDelay: "0.3s" }}
        d="M520,-105.1 C528.9,-53.3 533.3,-48.9 580.7,-40 C533.3,-31.1 528.9,-26.7 520,25.1 C511.1,-26.7 506.7,-31.1 459.3,-40 C506.7,-48.9 511.1,-53.3 520,-105.1 Z"
      />
      <path
        className="accent accent-sparkle"
        style={{ animationDelay: "0.46s" }}
        d="M470,-60.8 C474.9,-32.4 477.4,-29.9 503.4,-25 C477.4,-20.1 474.9,-17.6 470,10.8 C465.1,-17.6 462.6,-20.1 436.6,-25 C462.6,-29.9 465.1,-32.4 470,-60.8 Z"
      />
      <path
        className="accent accent-sparkle"
        style={{ animationDelay: "0.62s" }}
        d="M572,-95.8 C576.9,-67.4 579.4,-64.9 605.4,-60 C579.4,-55.1 576.9,-52.6 572,-24.2 C567.1,-52.6 564.6,-55.1 538.6,-60 C564.6,-64.9 567.1,-67.4 572,-95.8 Z"
      />
    </>
  );
}

function SwayAccents() {
  return (
    <>
      <path className="accent accent-trail" style={{ animationDelay: "0.3s" }} d="M440,-40 Q500,-92 560,-40" />
      <path className="accent accent-trail" style={{ animationDelay: "0.4s" }} d="M462,-16 Q520,-68 578,-16" />
      <path className="accent accent-trail" style={{ animationDelay: "0.5s" }} d="M484,8 Q542,-44 600,8" />
    </>
  );
}

const ACCENTS_BY_GESTURE = {
  pop: PopAccents,
  nod: NodAccents,
  sway: SwayAccents,
};

// `gesture` is one of "pop" / "nod" / "sway" (`GESTURES` below is the
// canonical order `CelebrationLayer` cycles through). `playing` / `leaving`
// toggle the CSS classes that trigger the entrance/gesture/exit keyframes in
// `src/index.css` — this component owns no timers itself.
export const GESTURES = ["pop", "nod", "sway"];

export function KangarooSprite({ gesture, playing = false, leaving = false, className = "" }) {
  const Accents = ACCENTS_BY_GESTURE[gesture];
  return (
    <svg
      viewBox="-80 -240 1200 990"
      aria-hidden="true"
      className={`roo gesture-${gesture} ${playing ? "playing" : ""} ${leaving ? "leaving" : ""} ${className}`.trim()}
    >
      <ellipse className="ground" cx="520" cy="705" rx="280" ry="18" />
      <g className="silhouette-group">
        <path className="silhouette" d={ROO_PATH_D} />
      </g>
      <g className="accents">
        <Accents />
      </g>
    </svg>
  );
}
