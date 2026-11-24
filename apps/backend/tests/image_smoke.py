"""
Runtime smoke test for one backend process: ``api`` or ``worker``.

It exercises the code paths whose dependencies are imported lazily, by a library on our
behalf, or only reached through a fallback branch, so a package missing from an extra
shows up here instead of in production. Importing the entrypoint does not find these:
``transformers`` is imported by langchain inside ``embed_query``, and the chat-upload
fallbacks swallow ``ImportError`` and return a "libraries not available" string.

Run it inside a built image, where it proves that image's own dependency set
(``uv sync --extra api`` or ``--extra worker``), its system binaries and its baked-in
data, with no network:

    docker run --rm -i --network none <image> python - api < tests/image_smoke.py

``tests/test_image_smoke.py`` runs the same checks under pytest with ``--lenient``, which
skips the checks that need tesseract, ffmpeg, git or the NLTK data on the host.

Everything it reads is generated in a temp directory; nothing is fetched.
"""

from __future__ import annotations

import json
import logging
import os
import shutil
import sys
import tempfile
import traceback
import warnings
from unittest import mock

LIBRARIES_NOT_AVAILABLE = "libraries not available"


# ---------------------------------------------------------------------------
# Fixtures, generated with the libraries both processes already ship.
# ---------------------------------------------------------------------------


def _make_docx_with_header_only(path: str) -> str:
    """A DOCX whose only text is in the page header: python-docx's body walk finds nothing."""
    import docx

    document = docx.Document()
    document.sections[0].header.paragraphs[0].text = "smoke header text"
    document.save(path)
    return "smoke header text"


def _make_xlsx(path: str) -> str:
    import openpyxl

    workbook = openpyxl.Workbook()
    sheet = workbook.active
    sheet.append(["name", "value"])
    sheet.append(["smoke cell text", 42])
    workbook.save(path)
    return "smoke cell text"


def _make_pptx(path: str) -> str:
    import pptx

    presentation = pptx.Presentation()
    slide = presentation.slides.add_slide(presentation.slide_layouts[0])
    slide.shapes.title.text = "smoke slide title"
    presentation.save(path)
    return "smoke slide title"


def _make_pdf(path: str) -> str:
    import fitz

    document = fitz.open()
    document.new_page().insert_text((72, 72), "smoke pdf text")
    document.save(path)
    document.close()
    return "smoke pdf text"


def _page_text(documents) -> str:
    return "\n".join(document.page_content for document in documents)


# ---------------------------------------------------------------------------
# API checks
# ---------------------------------------------------------------------------


def check_api_entrypoint(tmp: str, lenient: bool) -> None:
    """The module gunicorn loads, with everything it imports at module level."""
    # main.py builds its SQLAlchemy engine at import time and refuses to without a database
    # configuration. The engine is lazy, so a host that cannot resolve is enough.
    for name, value in (
        ("POSTGRES_USERNAME", "smoke"),
        ("POSTGRES_PASSWORD", "smoke"),
        ("POSTGRES_ENDPOINT", "db.invalid"),
        ("POSTGRES_PORT", "5432"),
        ("POSTGRES_DATABASE", "smoke"),
    ):
        os.environ.setdefault(name, value)

    import ai_ta_backend.main  # noqa: F401


class _FakeTokenizer:
    """Stands in for the tokenizer AutoTokenizer would download from the Hugging Face hub."""

    def encode(self, text, add_special_tokens=False):
        self._words = text.split()
        return list(range(len(self._words)))

    def decode(self, token_ids):
        return " ".join(self._words[i] for i in token_ids)


def check_api_embeddings_without_tiktoken(tmp: str, lenient: bool) -> None:
    """Every embedding model except text-embedding-ada-002 takes langchain's transformers path.

    Same construction as RetrievalService.__init__ and _resolve_embedding_client. The HTTP
    call is answered in-process and the tokenizer download is replaced, so the only real
    things under test are the import of ``transformers`` and the request it leads to.
    """
    import httpx
    import openai
    import transformers
    from langchain.embeddings.openai import OpenAIEmbeddings

    requests_seen = []

    def embeddings_endpoint(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        requests_seen.append(body)
        inputs = body["input"] if isinstance(body["input"], list) else [body["input"]]
        return httpx.Response(
            200,
            json={
                "object": "list",
                "model": body["model"],
                "usage": {"prompt_tokens": 1, "total_tokens": 1},
                "data": [
                    {"object": "embedding", "index": i, "embedding": [0.1, 0.2, 0.3]}
                    for i, _ in enumerate(inputs)
                ],
            },
        )

    api_base = "http://embeddings.invalid/v1"
    client = OpenAIEmbeddings(
        model="Qwen/Qwen3-Embedding-8B",
        openai_api_key="smoke",
        openai_api_base=api_base,
        tiktoken_enabled=False,
        # The sync client, with its transport swapped for the in-process endpoint above.
        client=openai.OpenAI(
            api_key="smoke",
            base_url=api_base,
            http_client=httpx.Client(transport=httpx.MockTransport(embeddings_endpoint)),
        ).embeddings,
    )
    with mock.patch.object(
        transformers.AutoTokenizer, "from_pretrained", return_value=_FakeTokenizer()
    ):
        document_vector = client.embed_documents(["a chunk of an uploaded chat file"])[0]
        query_vector = client.embed_query("Instruct: retrieve\nQuery: smoke")

    assert len(document_vector) == 3 and len(query_vector) == 3, (document_vector, query_vector)
    assert [r["model"] for r in requests_seen] == ["Qwen/Qwen3-Embedding-8B"] * 2, requests_seen
    assert requests_seen[0]["input"] == ["a chunk of an uploaded chat file"], requests_seen[0]


def check_api_chat_upload_fallbacks(tmp: str, lenient: bool) -> None:
    """The second-chance loaders behind /process-chat-file must load, not report missing libraries."""
    from langchain.document_loaders import (
        Docx2txtLoader,
        UnstructuredExcelLoader,
        UnstructuredPowerPointLoader,
    )

    from ai_ta_backend.service.retrieval_service import RetrievalService

    docx_path = os.path.join(tmp, "header_only.docx")
    header_text = _make_docx_with_header_only(docx_path)
    # Through the service: the primary python-docx pass finds no body text, so the result
    # comes from the Docx2txtLoader fallback (or from its "not available" string).
    extracted = RetrievalService._extract_docx_content(None, docx_path)
    assert LIBRARIES_NOT_AVAILABLE not in extracted, extracted
    assert header_text in extracted, extracted
    assert header_text in _page_text(Docx2txtLoader(docx_path).load())

    xlsx_path = os.path.join(tmp, "sheet.xlsx")
    cell_text = _make_xlsx(xlsx_path)
    assert cell_text in _page_text(UnstructuredExcelLoader(xlsx_path, mode="elements").load())

    pptx_path = os.path.join(tmp, "deck.pptx")
    title_text = _make_pptx(pptx_path)
    assert title_text in _page_text(UnstructuredPowerPointLoader(pptx_path).load())


# ---------------------------------------------------------------------------
# Worker checks
# ---------------------------------------------------------------------------


def _import_worker_modules():
    """Import worker.py and ingest.py the way the image runs them: by bare name, from their folder."""
    import ai_ta_backend

    rabbitmq_dir = os.path.join(os.path.dirname(ai_ta_backend.__file__), "rabbitmq")
    sys.path.insert(0, rabbitmq_dir)
    import ingest
    import worker

    return worker, ingest


def check_worker_entrypoint(tmp: str, lenient: bool) -> None:
    _import_worker_modules()


def check_worker_document_loaders(tmp: str, lenient: bool) -> None:
    """The loaders ingest.py uses, taken from its own namespace so the import path is the real one."""
    _, ingest = _import_worker_modules()

    docx_path = os.path.join(tmp, "header_only.docx")
    header_text = _make_docx_with_header_only(docx_path)
    assert header_text in _page_text(ingest.Docx2txtLoader(docx_path).load())

    xlsx_path = os.path.join(tmp, "sheet.xlsx")
    cell_text = _make_xlsx(xlsx_path)
    assert cell_text in _page_text(ingest.UnstructuredExcelLoader(xlsx_path, mode="elements").load())

    pptx_path = os.path.join(tmp, "deck.pptx")
    title_text = _make_pptx(pptx_path)
    assert title_text in _page_text(ingest.UnstructuredPowerPointLoader(pptx_path).load())

    pdf_path = os.path.join(tmp, "page.pdf")
    pdf_text = _make_pdf(pdf_path)
    with ingest.fitz.open(pdf_path) as document:
        assert pdf_text in document[0].get_text()
    with ingest.pdfplumber.open(pdf_path) as pdf:
        assert pdf_text in pdf.pages[0].extract_text()


def check_worker_system_binaries(tmp: str, lenient: bool) -> None:
    """tesseract, ffmpeg and git are installed by the Dockerfile, not by uv."""
    _, ingest = _import_worker_modules()

    missing = [name for name in ("tesseract", "ffmpeg", "git") if shutil.which(name) is None]
    if missing and lenient:
        raise _Skipped(f"not installed on this host: {', '.join(missing)}")
    assert not missing, f"missing from the image: {missing}"

    image = ingest.Image.new("RGB", (240, 80), "white")
    assert isinstance(ingest.pytesseract.image_to_string(image), str)

    # mp3 encode and decode both shell out to ffmpeg.
    mp3_path = os.path.join(tmp, "silence.mp3")
    ingest.AudioSegment.silent(duration=300).export(mp3_path, format="mp3")
    assert len(ingest.AudioSegment.from_file(mp3_path, "mp3")) > 0

    import git

    assert git.Git().version().startswith("git version")


def check_worker_nltk_data(tmp: str, lenient: bool) -> None:
    """unstructured needs these two NLTK packages; the Dockerfile bakes them in (a runtime fetch gets a 403)."""
    import nltk

    try:
        nltk.data.find("tokenizers/punkt_tab")
        nltk.data.find("taggers/averaged_perceptron_tagger_eng")
    except LookupError:
        if lenient:
            raise _Skipped("NLTK data not downloaded on this host")
        raise


# ---------------------------------------------------------------------------


class _Skipped(Exception):
    pass


CHECKS = {
    "api": [
        check_api_entrypoint,
        check_api_embeddings_without_tiktoken,
        check_api_chat_upload_fallbacks,
    ],
    "worker": [
        check_worker_entrypoint,
        check_worker_document_loaders,
        check_worker_system_binaries,
        check_worker_nltk_data,
    ],
}


def main(argv: list[str]) -> int:
    args = [a for a in argv if not a.startswith("--")]
    if len(args) != 1 or args[0] not in CHECKS:
        print(f"usage: image_smoke.py {{{'|'.join(CHECKS)}}} [--lenient]", file=sys.stderr)
        return 2
    lenient = "--lenient" in argv

    # The worker configures DEBUG logging on import and langchain warns on every legacy
    # import path; neither helps read a pass/fail list.
    warnings.filterwarnings("ignore")
    logging.disable(logging.WARNING)

    failed = 0
    for check in CHECKS[args[0]]:
        with tempfile.TemporaryDirectory() as tmp:
            try:
                check(tmp, lenient)
            except _Skipped as skipped:
                print(f"SKIP {check.__name__}: {skipped}", flush=True)
            except Exception:
                failed += 1
                print(f"FAIL {check.__name__}", flush=True)
                traceback.print_exc()
            else:
                print(f"ok   {check.__name__}", flush=True)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
