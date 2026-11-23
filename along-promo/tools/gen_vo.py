"""Generate the voice-over with Edge neural TTS; record each clip's duration and word timings.

python tools/gen_vo.py            # all lines
python tools/gen_vo.py X1 N2      # only these
Narrator: zh-CN-XiaoxiaoNeural (warm female). 小游: zh-CN-YunxiaNeural (cartoon, cute), pitch raised.
Output: public/vo/<id>.mp3, src/vo-durations.json {id: seconds}, src/vo-words.json {id: [[word, start_s, end_s]]}.
"""
import asyncio, json, subprocess, sys
from pathlib import Path

import edge_tts

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public" / "vo"
OUT.mkdir(parents=True, exist_ok=True)

VOICES = {
    "N": dict(voice="zh-CN-XiaoxiaoNeural", rate="+8%", pitch="+0Hz"),
    "X": dict(voice="zh-CN-YunxiaNeural", rate="+6%", pitch="+18Hz"),
}

LINES = json.loads((ROOT / "src" / "vo-lines.json").read_text(encoding="utf8"))


def duration(path: Path) -> float:
    out = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", str(path)],
                         capture_output=True, text=True, check=True).stdout.strip()
    return float(out)


async def synth(line):
    v = VOICES[line["id"][0]]
    path = OUT / f"{line['id']}.mp3"
    words = []
    com = edge_tts.Communicate(line["tts"], v["voice"], rate=v["rate"], pitch=v["pitch"], boundary="WordBoundary")
    with open(path, "wb") as f:
        async for chunk in com.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                s = chunk["offset"] / 1e7
                words.append([chunk["text"], round(s, 3), round(s + chunk["duration"] / 1e7, 3)])
    return path, words


async def main(only):
    dur_path, words_path = ROOT / "src" / "vo-durations.json", ROOT / "src" / "vo-words.json"
    durs = json.loads(dur_path.read_text(encoding="utf8")) if dur_path.exists() else {}
    allw = json.loads(words_path.read_text(encoding="utf8")) if words_path.exists() else {}
    for line in LINES:
        if only and line["id"] not in only:
            continue
        path, words = await synth(line)
        durs[line["id"]] = round(duration(path), 3)
        allw[line["id"]] = words
        print(line["id"], durs[line["id"]], "s", " ".join(f"{w}@{s}" for w, s, _ in words))
    dur_path.write_text(json.dumps(durs, ensure_ascii=False, indent=1), encoding="utf8")
    words_path.write_text(json.dumps(allw, ensure_ascii=False, indent=1), encoding="utf8")


asyncio.run(main(set(sys.argv[1:])))
