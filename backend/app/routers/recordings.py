import os
import re

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models import models

router = APIRouter(prefix="/recordings", tags=["recordings"])

CHUNK_SIZE = 1024 * 1024  # 1 MB
RANGE_RE = re.compile(r"bytes=(\d*)-(\d*)")


@router.get("/{recording_id}/audio")
def get_recording_audio(
    recording_id: int, request: Request, db: Session = Depends(get_db)
):
    recording = db.get(models.Recording, recording_id)
    if not recording:
        raise HTTPException(status_code=404, detail="Recording not found")

    file_path = recording.file_path
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Audio file not found on disk")

    file_size = os.path.getsize(file_path)
    range_header = request.headers.get("range")

    if range_header is None:
        def iter_full():
            with open(file_path, "rb") as f:
                while True:
                    data = f.read(CHUNK_SIZE)
                    if not data:
                        break
                    yield data

        return StreamingResponse(
            iter_full(),
            media_type=recording.mime_type,
            headers={
                "Content-Length": str(file_size),
                "Accept-Ranges": "bytes",
            },
        )

    match = RANGE_RE.match(range_header)
    if not match:
        raise HTTPException(status_code=416, detail="Invalid Range header")

    start_str, end_str = match.groups()
    start = int(start_str) if start_str else 0
    end = int(end_str) if end_str else file_size - 1
    end = min(end, file_size - 1)

    if start > end or start >= file_size:
        raise HTTPException(status_code=416, detail="Requested range not satisfiable")

    chunk_length = end - start + 1

    def iter_range():
        with open(file_path, "rb") as f:
            f.seek(start)
            remaining = chunk_length
            while remaining > 0:
                data = f.read(min(CHUNK_SIZE, remaining))
                if not data:
                    break
                remaining -= len(data)
                yield data

    headers = {
        "Content-Range": f"bytes {start}-{end}/{file_size}",
        "Accept-Ranges": "bytes",
        "Content-Length": str(chunk_length),
    }
    return StreamingResponse(
        iter_range(),
        status_code=206,
        media_type=recording.mime_type,
        headers=headers,
    )
