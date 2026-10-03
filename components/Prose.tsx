import { Fragment } from "react";

// A deliberately small formatter for staff-written pages and news: headings (## / ###), bullet
// lists, **bold**, and [links](https://...). Everything is rendered as React text nodes, so
// markup typed into the editor can never execute.

function inline(text: string): React.ReactNode[] {
  const nodes: React.ReactNode[] = [];
  const pattern = /\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+|\/[^\s)]*|mailto:[^\s)]+)\)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text))) {
    if (match.index > last) nodes.push(text.slice(last, match.index));
    if (match[1]) nodes.push(<strong key={match.index}>{match[1]}</strong>);
    else {
      const external = match[3].startsWith("http");
      nodes.push(<a key={match.index} href={match[3]} {...(external ? { rel: "noopener noreferrer nofollow", target: "_blank" } : {})}>{match[2]}</a>);
    }
    last = match.index + match[0].length;
  }
  if (last < text.length) nodes.push(text.slice(last));
  return nodes;
}

export function Prose({ source, className = "prose" }: { source: string; className?: string }) {
  const blocks = source.replace(/\r\n/g, "\n").split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);
  return (
    <div className={className}>
      {blocks.map((block, index) => {
        if (block.startsWith("### ")) return <h3 key={index}>{inline(block.slice(4))}</h3>;
        if (block.startsWith("## ")) return <h2 key={index}>{inline(block.slice(3))}</h2>;
        const lines = block.split("\n");
        if (lines.every((line) => /^[-*] /.test(line))) {
          return <ul key={index}>{lines.map((line, i) => <li key={i}>{inline(line.slice(2))}</li>)}</ul>;
        }
        return (
          <p key={index}>
            {lines.map((line, i) => <Fragment key={i}>{i > 0 && <br />}{inline(line)}</Fragment>)}
          </p>
        );
      })}
    </div>
  );
}

/** Plain user text (comments, descriptions): line breaks kept, nothing else interpreted. */
export function PlainText({ text, className }: { text: string; className?: string }) {
  return <p className={className} style={{ whiteSpace: "pre-wrap" }}>{text}</p>;
}
