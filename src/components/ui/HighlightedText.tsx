import { memo } from "react";
import { TextStyle } from "react-native";
import { Text } from "./AppText";

export const HighlightedText = memo(function HighlightedText({ text, query, style, highlightStyle }: { text: string; query: string; style: TextStyle | TextStyle[]; highlightStyle: TextStyle }) {
  const value = String(text || "");
  const needle = String(query || "").trim();
  if (!needle) return <Text numberOfLines={1} style={style}>{value}</Text>;
  const lowerValue = value.toLowerCase();
  const lowerNeedle = needle.toLowerCase();
  const parts: Array<{ text: string; match: boolean }> = [];
  let cursor = 0;
  let index = lowerValue.indexOf(lowerNeedle);
  while (index >= 0) {
    if (index > cursor) parts.push({ text: value.slice(cursor, index), match: false });
    parts.push({ text: value.slice(index, index + needle.length), match: true });
    cursor = index + needle.length;
    index = lowerValue.indexOf(lowerNeedle, cursor);
  }
  if (cursor < value.length) parts.push({ text: value.slice(cursor), match: false });
  return (
    <Text numberOfLines={1} style={style}>
      {parts.map((part, indexPart) => (
        <Text key={`${part.text}-${indexPart}`} style={part.match ? highlightStyle : undefined}>
          {part.text}
        </Text>
      ))}
    </Text>
  );
});

