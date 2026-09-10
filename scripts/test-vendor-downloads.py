"""Network boundary regression tests for the reviewed asset vendoring commands."""
import importlib.util
import tempfile
import ssl
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch


def module(name):
    source = Path(__file__).resolve().with_name(name + ".py")
    spec = importlib.util.spec_from_file_location(name, source)
    loaded = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(loaded)
    return loaded


FONTS = module("vendor-fonts")
STICKERS = module("vendor-stickers")


class VendorDownloadTests(unittest.TestCase):
    def test_approved_tls_origins_and_exact_paths(self):
        for vendor, url, host, target in [
            (FONTS, "https://registry.npmjs.org/@fontsource%2Froboto/5.3.0", "registry.npmjs.org", "/@fontsource%2Froboto/5.3.0"),
            (FONTS, "https://api.fontsource.org/v1/fonts", "api.fontsource.org", "/v1/fonts"),
            (STICKERS, "https://api.github.com/repos/microsoft/fluentui-emoji/git/trees/pinned?recursive=1", "api.github.com", "/repos/microsoft/fluentui-emoji/git/trees/pinned?recursive=1"),
            (STICKERS, "https://raw.githubusercontent.com/microsoft/fluentui-emoji/pinned/LICENSE", "raw.githubusercontent.com", "/microsoft/fluentui-emoji/pinned/LICENSE"),
        ]:
            with self.subTest(url=url):
                connection = MagicMock()
                connection.getresponse.return_value.status = 200
                connection.getresponse.return_value.read.return_value = b"verified bytes"
                with patch.object(vendor.http.client, "HTTPSConnection", return_value=connection) as connect:
                    self.assertEqual(vendor.read_url(url), b"verified bytes")
                    self.assertEqual(connect.call_args.args, (host,))
                    self.assertEqual(connect.call_args.kwargs['timeout'], 60)
                    tls = connect.call_args.kwargs['context']
                    self.assertEqual(tls.verify_mode, ssl.CERT_REQUIRED)
                    self.assertTrue(tls.check_hostname)
                    self.assertEqual(connection.request.call_args.args, ("GET", target))
                    connection.close.assert_called_once()

    def test_refuses_other_schemes_credentials_ports_and_host_confusion_before_connection(self):
        for vendor in (FONTS, STICKERS):
            host = sorted(vendor.DOWNLOAD_HOSTS)[0]
            invalid = [f"http://{host}/file", "file:///C:/private", f"https://{host}.attacker.test/file", f"https://{host}@attacker.test/file", f"https://user:password@{host}/file", f"https://{host}:444/file", f"https://{host}/file#fragment", f" https://{host}/file", f"https://{host}/file\n", "https://127.0.0.1/private"]
            for url in invalid:
                with self.subTest(url=url), patch.object(vendor.http.client, "HTTPSConnection") as connect:
                    with self.assertRaises(ValueError):
                        vendor.read_url(url)
                    connect.assert_not_called()

    def test_redirects_and_failures_never_trigger_a_second_request(self):
        for vendor in (FONTS, STICKERS):
            for status in (301, 302, 307, 308, 404, 500):
                connection = MagicMock()
                connection.getresponse.return_value.status = status
                connection.getresponse.return_value.getheader.return_value = "file:///C:/private"
                with self.subTest(status=status), patch.object(vendor.http.client, "HTTPSConnection", return_value=connection) as connect:
                    with self.assertRaisesRegex(ValueError, "redirects are not followed"):
                        vendor.read_url("https://" + sorted(vendor.DOWNLOAD_HOSTS)[0] + "/file")
                    connect.assert_called_once()
                    connection.request.assert_called_once()
                    connection.close.assert_called_once()

    def test_cached_git_blobs_require_valid_identity_and_matching_content(self):
        data = b'<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0"/></svg>'
        # Independently obtained with git hash-object over these exact fixture bytes.
        sha = "6fde8bc4566a5403d48e6631fde82a0dd33bbadc"
        with tempfile.TemporaryDirectory() as directory, patch.object(STICKERS, "CACHE", Path(directory)):
            (Path(directory) / sha).write_bytes(data)
            self.assertEqual(STICKERS.fetch("assets/test/Color/test.svg", sha), data)
            (Path(directory) / sha).write_bytes(b"modified")
            with self.assertRaisesRegex(ValueError, "content mismatch"):
                STICKERS.fetch("assets/test/Color/test.svg", sha)
            for source, digest in [("../outside.svg", sha), ("/outside.svg", sha), ("valid.svg", "../../outside"), ("valid.svg", None)]:
                with self.assertRaisesRegex(ValueError, "Git blob identity"):
                    STICKERS.fetch(source, digest)

    def test_static_svg_refuses_mixed_case_external_references(self):
        STICKERS.check_svg(b'<svg><path fill="url(#local)"/></svg>')
        for attribute in ['fill="URL(HTTPS://example.test/a.svg)"', 'HREF="#local"', 'style="fill:UrL(data:image/svg+xml,bad)"', 'onLoad="alert(1)"']:
            with self.subTest(attribute=attribute), self.assertRaises(ValueError):
                STICKERS.check_svg(("<svg><path " + attribute + "/></svg>").encode())


if __name__ == "__main__":
    unittest.main()
