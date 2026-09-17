#!/usr/bin/env python3
"""Unit tests for the pure config-building helpers in external_connections_cli.py.

Run from this directory:  python3 -m unittest test_external_connections_cli
No network, no .external.env, and no python-dotenv needed (it is stubbed).
"""

from __future__ import annotations

import importlib.util
import os
import sys
import types
import unittest
from pathlib import Path


def _load_cli():
    # The CLI imports python-dotenv at module load; stub it so the tests run
    # without the requirements installed.
    sys.modules.setdefault(
        "dotenv", types.SimpleNamespace(load_dotenv=lambda *a, **k: None)
    )
    os.environ["EXTERNAL_ENV_FILE"] = os.devnull
    path = Path(__file__).with_name("external_connections_cli.py")
    spec = importlib.util.spec_from_file_location("external_connections_cli", path)
    module = importlib.util.module_from_spec(spec)
    real_stderr, sys.stderr = sys.stderr, open(os.devnull, "w")
    try:
        spec.loader.exec_module(module)
    finally:
        sys.stderr.close()
        sys.stderr = real_stderr
    return module


cli = _load_cli()


class ParseQdrantCollectionsTests(unittest.TestCase):
    def parse(self, raw):
        return cli._parse_qdrant_collections(raw)

    def assert_rejected(self, raw, *fragments):
        with self.assertRaises(SystemExit) as ctx:
            self.parse(raw)
        for fragment in fragments:
            self.assertIn(fragment, str(ctx.exception))

    def test_comma_form_expands_to_name_entries(self):
        self.assertEqual(
            self.parse(" pubmed-articles, us-patents ,"),
            [{"name": "pubmed-articles"}, {"name": "us-patents"}],
        )

    def test_empty_value_yields_no_entries(self):
        self.assertEqual(self.parse("   "), [])

    def test_json_array_of_objects_is_validated_and_kept(self):
        self.assertEqual(
            self.parse('[{"name": " a ", "top_n": 5, "use_filter": false, "processor": "pubmed"}]'),
            [{"name": "a", "top_n": 5, "use_filter": False, "processor": "pubmed"}],
        )

    def test_json_array_of_bare_strings_is_shorthand_for_names(self):
        self.assertEqual(
            self.parse('["pubmed-articles", {"name": "us-patents", "processor": "patents"}]'),
            [{"name": "pubmed-articles"}, {"name": "us-patents", "processor": "patents"}],
        )

    def test_bare_json_object_is_rejected_not_comma_split(self):
        self.assert_rejected(
            '{"name": "pubmed-articles", "top_n": 50}',
            "single JSON object",
            '[{"name": "pubmed-articles", "top_n": 50}]',
        )

    def test_array_missing_brackets_is_rejected(self):
        # Starts with `{` so it hits the JSON branch and fails to decode.
        self.assert_rejected('{"name": "a"}, {"name": "b"}', "not valid JSON")

    def test_json_fragment_in_comma_form_is_rejected(self):
        # Does not start with `[`/`{`, but clearly is not a list of names.
        self.assert_rejected('"name": "a", "top_n": 50', "looks like a fragment of JSON")

    def test_non_array_json_scalar_is_rejected(self):
        self.assert_rejected("[1, 2]", "EXT_QDRANT_COLLECTIONS[0] must be an object")

    def test_invalid_json_is_rejected(self):
        self.assert_rejected('[{"name": "a",}]', "not valid JSON")

    def test_duplicate_names_rejected_in_both_forms(self):
        self.assert_rejected("a,b,a", "more than once")
        self.assert_rejected('[{"name": "a"}, "a"]', "more than once")

    def test_unknown_key_is_rejected(self):
        self.assert_rejected('[{"name": "a", "topn": 5}]', "unknown key(s) ['topn']")

    def test_top_n_must_be_positive_int_and_not_bool(self):
        self.assert_rejected('[{"name": "a", "top_n": 0}]', "top_n must be a positive integer")
        self.assert_rejected('[{"name": "a", "top_n": true}]', "top_n must be a positive integer")
        self.assert_rejected('[{"name": "a", "top_n": "5"}]', "top_n must be a positive integer")

    def test_use_filter_must_be_bool(self):
        self.assert_rejected('[{"name": "a", "use_filter": "false"}]', "use_filter must be JSON true/false")

    def test_processor_must_be_known(self):
        self.assert_rejected('[{"name": "a", "processor": "pubmedd"}]', "processor must be one of")

    def test_name_required_and_non_empty(self):
        self.assert_rejected('[{"top_n": 5}]', 'non-empty string "name"')
        self.assert_rejected('[{"name": "  "}]', 'non-empty string "name"')


class ParseBoolTests(unittest.TestCase):
    def test_accepts_documented_words_case_insensitively(self):
        for word in ("1", "true", "YES", "On"):
            self.assertIs(cli._parse_bool(word, "X"), True)
        for word in ("0", "false", "NO", "Off"):
            self.assertIs(cli._parse_bool(word, "X"), False)

    def test_typos_fail_closed(self):
        for word in ("ture", "flase", "None", ""):
            with self.assertRaises(SystemExit):
                cli._parse_bool(word, "X")


class BuildQdrantConfigTests(unittest.TestCase):
    ENV = {
        "EXT_QDRANT_URL": "https://qdrant.example.edu",
        "EXT_QDRANT_API_KEY": "k",
        "EXT_QDRANT_PORT": "6333",
        "EXT_QDRANT_DEFAULT_COLLECTION": "proj",
        "EXT_QDRANT_COLLECTIONS": '["pubmed-articles"]',
        "EXT_QDRANT_PARALLEL": "false",
        "EXT_QDRANT_SORT_COMBINED": "no",
        "EXT_QDRANT_APPLY_COURSE_FILTER": "0",
    }

    def setUp(self):
        self._saved = {k: os.environ.get(k) for k in self.ENV}
        for key in self.ENV:
            os.environ.pop(key, None)

    def tearDown(self):
        for key, value in self._saved.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    def test_builds_every_optional_knob(self):
        os.environ.update(self.ENV)
        self.assertEqual(
            cli._build_config_from_env("qdrant"),
            {
                "url": "https://qdrant.example.edu",
                "api_key": "k",
                "port": 6333,
                "default_collection": "proj",
                "collections": [{"name": "pubmed-articles"}],
                "parallel": False,
                "sort_combined": False,
                "apply_course_filter": False,
            },
        )

    def test_omits_unset_knobs(self):
        os.environ["EXT_QDRANT_URL"] = self.ENV["EXT_QDRANT_URL"]
        os.environ["EXT_QDRANT_API_KEY"] = "k"
        self.assertEqual(
            cli._build_config_from_env("qdrant"),
            {"url": "https://qdrant.example.edu", "api_key": "k"},
        )

    def test_bad_port_and_bool_abort(self):
        os.environ.update(self.ENV)
        os.environ["EXT_QDRANT_PORT"] = "-1"
        with self.assertRaises(SystemExit):
            cli._build_config_from_env("qdrant")
        os.environ["EXT_QDRANT_PORT"] = "6333"
        os.environ["EXT_QDRANT_PARALLEL"] = "maybe"
        with self.assertRaises(SystemExit):
            cli._build_config_from_env("qdrant")


if __name__ == "__main__":
    unittest.main()
