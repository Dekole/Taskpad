#!/usr/bin/env python3
import http.server
import subprocess
import os
import logging

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
log = logging.getLogger(__name__)

WEBHOOK_SECRET = os.environ["WEBHOOK_SECRET"]
PROJECT_DIR = "/root/Taskpad"


class WebhookHandler(http.server.BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/webhook":
            self.send_response(404)
            self.end_headers()
            return

        secret = self.headers.get("X-Webhook-Secret", "")
        if secret != WEBHOOK_SECRET:
            log.warning("Rejected webhook: invalid secret from %s", self.client_address)
            self.send_response(403)
            self.end_headers()
            return

        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"deploying")

        log.info("Deploy triggered")
        subprocess.Popen(
            ["bash", "-c", "git pull origin main && docker compose up --build -d"],
            cwd=PROJECT_DIR
        )

    def log_message(self, format, *args):
        pass


if __name__ == "__main__":
    server = http.server.HTTPServer(("0.0.0.0", 9000), WebhookHandler)
    log.info("Webhook listening on 0.0.0.0:9000")
    server.serve_forever()
