import os

from deepgram import DeepgramClient, PrerecordedOptions

from app.config import get_settings


def transcribe(file_path: str, lead_id: int) -> dict:
    settings = get_settings()
    client = DeepgramClient(settings.DEEPGRAM_API_KEY)

    with open(file_path, "rb") as audio:
        source = {"buffer": audio.read(), "mimetype": _mime_type(file_path)}

    options = PrerecordedOptions(
        model="nova-2",
        language="en-AU",
        smart_format=True,
        diarize=True,
        diarize_version="latest",
        utterances=True,
        punctuate=True,
        paragraphs=True,
        multichannel=False,
    )

    response = client.listen.rest.v("1").transcribe_file(source, options)
    return _parse_response(response)


def _parse_response(response) -> dict:
    utterances = []
    raw_utterances = response.results.utterances or []

    SPEAKER_LABELS = {0: "Agent", 1: "Customer"}

    for i, utt in enumerate(raw_utterances):
        words = []
        if hasattr(utt, "words") and utt.words:
            words = [
                {
                    "word": w.word,
                    "start": w.start,
                    "end": w.end,
                    "confidence": w.confidence,
                    "speaker": w.speaker if hasattr(w, "speaker") else None,
                }
                for w in utt.words
            ]

        speaker_id = utt.speaker if utt.speaker is not None else 0
        utterances.append({
            "index": i,
            "speaker": speaker_id,
            "speaker_label": SPEAKER_LABELS.get(speaker_id, f"Speaker {speaker_id}"),
            "text": utt.transcript,
            "start": utt.start,
            "end": utt.end,
            "words": words,
        })

    all_words = []
    for ch in response.results.channels:
        for alt in ch.alternatives:
            if alt.words:
                all_words.extend(alt.words)

    avg_confidence = 0.0
    if all_words:
        avg_confidence = sum(w.confidence for w in all_words) / len(all_words)

    speakers = set()
    for u in utterances:
        speakers.add(u["speaker"])

    return {
        "utterances": utterances,
        "speaker_count": len(speakers),
        "word_count": len(all_words),
        "avg_confidence": round(avg_confidence, 4),
    }


def _mime_type(path: str) -> str:
    ext = os.path.splitext(path)[1].lower()
    return {
        ".wav": "audio/wav",
        ".mp3": "audio/mpeg",
        ".m4a": "audio/mp4",
        ".ogg": "audio/ogg",
        ".flac": "audio/flac",
        ".webm": "audio/webm",
    }.get(ext, "audio/wav")
