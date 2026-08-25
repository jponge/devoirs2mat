// One course heading with its homework underneath. The daily view and every day
// block of the weekly view use this same component, which is what makes the two
// views render identically — required by `specs/functional-specs.md`.
//
// The card itself, and the write it makes (`setHomeworkDone`), live here too:
// this is the one place both views' cards go through, the same way
// `CourseEditor` is the one place course writes go through.
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { openUrl } from "@tauri-apps/plugin-opener";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { useAppData } from "@/components/app-data";
import { setHomeworkDone } from "@/db/homework";
import { isAllowedLinkScheme } from "@/lib/markdown-links";

// Only the inline subset `specs/functional-specs.md` describes. `del` is what
// `remark-gfm`'s strikethrough (`~~text~~`) maps to — strikethrough is GFM, not
// core CommonMark, which is why that plugin is needed at all.
//
// `unwrapDisallowed` is deliberate: a heading, list, blockquote, table or image
// is not given special rendering, but it is not dropped either — its own inline
// children stay, so `# Devoir` shows as `Devoir`. There is no bespoke fallback
// that reproduces the markup characters themselves; this is `react-markdown`'s
// own restriction, doing exactly what it does out of the box.
const ALLOWED_ELEMENTS = ["p", "strong", "em", "code", "del", "a"];

// Reads `href` from the props react-markdown hands this component — already run
// through the library's own default URL transform — and never from
// `node.properties.href`, so that transform can never be bypassed. On top of it,
// the scheme is allow-listed: there is no content-security policy behind this
// ("csp" is deliberately null), so this check is the whole of the defence
// before a link ever reaches `@tauri-apps/plugin-opener`.
export function MarkdownLink({ href, children, onError }) {
  if (!isAllowedLinkScheme(href)) {
    return <>{children}</>;
  }

  const open = async (event) => {
    event.preventDefault();
    try {
      await openUrl(href);
    } catch (failure) {
      onError(failure, "link");
    }
  };

  return (
    <a href={href} onClick={open}>
      {children}
    </a>
  );
}

// Purely presentational: the write and the reload it triggers live in
// `CourseGroup`, which is the one place both views' cards go through.
function HomeworkCard({ item, onToggle, onError }) {
  const { t } = useTranslation();
  const done = item.done === 1;

  return (
    <div className="flex items-start gap-3 rounded-2xl border p-3">
      <Checkbox
        checked={done}
        aria-label={t("homework.toggleDone")}
        onCheckedChange={(checked) => onToggle(checked === true)}
      />
      {item.text === "" ? null : (
        <div className={cn("text-sm", done && "text-muted-foreground line-through")}>
          <ReactMarkdown
            allowedElements={ALLOWED_ELEMENTS}
            unwrapDisallowed
            remarkPlugins={[remarkGfm]}
            components={{ a: (props) => <MarkdownLink {...props} onError={onError} /> }}
          >
            {item.text}
          </ReactMarkdown>
        </div>
      )}
    </div>
  );
}

export function CourseGroup({ group, onError = () => {} }) {
  const { reload } = useAppData();
  const archived = group.course.archived_at !== null && group.course.archived_at !== undefined;

  const toggle = async (item, checked) => {
    try {
      await setHomeworkDone(item.id, checked);
      await reload();
    } catch (failure) {
      onError(failure, "save");
    }
  };

  return (
    <section className="flex flex-col gap-2">
      {/* An entry on a deleted course keeps displaying the real course name,
          muted. The course is archived, never hard-deleted, precisely so this
          name still exists. */}
      <h3 className={cn("text-sm font-medium", archived && "text-muted-foreground")}>
        {group.course.name}
      </h3>
      <ul className="flex flex-col gap-2">
        {group.homework.map((item) => (
          <li key={item.id} data-testid="homework-item">
            <HomeworkCard
              item={item}
              onToggle={(checked) => toggle(item, checked)}
              onError={onError}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

// The short muted line an empty area shows rather than nothing at all, so that
// it reads as a deliberately empty day. Required by both the functional specs
// and the design guidelines.
export function EmptyLine({ children }) {
  return <p className="text-sm text-muted-foreground">{children}</p>;
}
