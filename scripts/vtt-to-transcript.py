"""Convert a WebVTT caption file into a readable, timestamped Markdown transcript.

Usage: python3 scripts/vtt-to-transcript.py source/talk.en.vtt > source/transcript.md
Cues are merged into paragraphs of roughly 45 seconds, each prefixed by its start time.
"""
import re
import sys

TIME = re.compile(r"(\d+):(\d+):(\d+)\.(\d+) --> ")


def seconds(m: re.Match) -> float:
    h, mi, s, ms = (int(x) for x in m.groups())
    return h * 3600 + mi * 60 + s + ms / 1000


def stamp(t: float) -> str:
    t = int(t)
    return f"{t // 60:02d}:{t % 60:02d}"


def main(path: str) -> None:
    cues: list[tuple[float, str]] = []
    start = None
    buf: list[str] = []
    for line in open(path, encoding="utf-8"):
        line = line.rstrip("\n")
        m = TIME.match(line)
        if m:
            start, buf = seconds(m), []
            continue
        if start is not None and line.strip():
            buf.append(line.strip())
        elif start is not None and not line.strip():
            cues.append((start, " ".join(buf)))
            start = None
    if start is not None and buf:
        cues.append((start, " ".join(buf)))

    paras: list[tuple[float, list[str]]] = []
    for t, text in cues:
        if not paras or (t - paras[-1][0] > 45 and paras[-1][1][-1].endswith((".", "?", "!", '"'))):
            paras.append((t, []))
        paras[-1][1].append(text)

    print("# Transcript — The AGI economy: how AI could stabilize public debt\n")
    print("Speaker: Tyler Cowen · Sana AI Summit 2026, New York, May 21, 2026")
    print("Source: https://www.youtube.com/watch?v=aJlg6o0A_Js\n")
    for t, parts in paras:
        print(f"**[{stamp(t)}]** {' '.join(parts)}\n")


if __name__ == "__main__":
    main(sys.argv[1])
