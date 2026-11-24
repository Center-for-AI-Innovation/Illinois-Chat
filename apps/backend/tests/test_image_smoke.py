"""
Runs tests/image_smoke.py for both processes under pytest.

The same script runs inside each built image in the ``backend-images`` job, where it sees
only that image's extra. Here it runs against the development environment (all extras), in
a subprocess so the worker's bare-name imports (``worker``, ``ingest``, ``models``) do not
leak into the other tests. ``--lenient`` skips the checks that need tesseract, ffmpeg, git
or the NLTK data on the host; nothing here uses the network.
"""

from __future__ import annotations

import os
import subprocess
import sys

import pytest

_BACKEND_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
_SCRIPT = os.path.join(_BACKEND_DIR, "tests", "image_smoke.py")


@pytest.mark.parametrize("process", ["api", "worker"])
def test_runtime_dependencies_are_installed(process):
    result = subprocess.run(
        [sys.executable, _SCRIPT, process, "--lenient"],
        cwd=_BACKEND_DIR,
        env={**os.environ, "PYTHONPATH": _BACKEND_DIR},
        capture_output=True,
        text=True,
        timeout=300,
    )
    output = result.stdout + result.stderr
    assert result.returncode == 0, output
    assert "FAIL" not in result.stdout, output
