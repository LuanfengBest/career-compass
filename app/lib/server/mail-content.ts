import { load } from "cheerio";
export type MailPayload = {
  mimeType?: string;
  body?: { data?: string };
  parts?: MailPayload[];
};
export function mailBody(payload?: MailPayload): string {
  if (!payload) return "";
  // multipart/alternative contains the same message twice; prefer its plain-text version.
  if (payload.mimeType === "multipart/alternative" && payload.parts) {
    const plain = payload.parts.find((p) => p.mimeType === "text/plain");
    if (plain) {
      const body = mailBody(plain);
      if (body) return body;
    }
  }
  let text = "";
  if (
    payload.body?.data &&
    ["text/plain", "text/html"].includes(payload.mimeType || "")
  ) {
    text = Buffer.from(payload.body.data, "base64url")
      .toString("utf8")
      .slice(0, 100000);
    if (payload.mimeType === "text/html") {
      const $ = load(text);
      $("script,style,blockquote,.gmail_quote,.yahoo_quoted").remove();
      $("br").replaceWith("\n");
      $("p,div,tr,li").append("\n");
      text = $.text();
    }
  }
  return [text, ...(payload.parts || []).map(mailBody)]
    .join("\n")
    .replace(/\r/g, "")
    .split(
      /\nOn [^\n]{0,200}wrote:\s*\n|\n-{2,}\s*Original Message\s*-{2,}/i,
    )[0]
    .split("\n")
    .filter((line) => !/^\s*>/.test(line))
    .join("\n")
    .replace(/[ \t]+/g, " ")
    .trim()
    .slice(0, 30000);
}
