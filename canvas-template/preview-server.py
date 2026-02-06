#!/usr/bin/env python3
"""
SmartMeter Dashboard Preview Server
Quick local preview of the dashboard without OpenClaw
"""

import http.server
import socketserver
import os
import sys
from pathlib import Path

PORT = 8080
DIRECTORY = Path(__file__).parent

class CustomHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(DIRECTORY), **kwargs)
    
    def log_message(self, format, *args):
        # Cleaner log output
        print(f"[{self.log_date_time_string()}] {format % args}")

def main():
    print(f"""
╔════════════════════════════════════════════════════════╗
║          SmartMeter Dashboard Preview Server          ║
╚════════════════════════════════════════════════════════╝

🚀 Starting server on port {PORT}...
📂 Serving files from: {DIRECTORY}

🌐 Open in browser:
   http://localhost:{PORT}

📊 Dashboard features:
   • Live-updating charts
   • Sample cost analysis data
   • Interactive recommendations
   • Professional UI design

Press Ctrl+C to stop the server
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
""")

    try:
        with socketserver.TCPServer(("", PORT), CustomHandler) as httpd:
            print(f"✓ Server running on http://localhost:{PORT}")
            print()
            httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n\n⏹  Server stopped")
        sys.exit(0)
    except OSError as e:
        if e.errno == 48:  # Address already in use
            print(f"\n❌ Error: Port {PORT} is already in use")
            print(f"   Try: lsof -ti:{PORT} | xargs kill -9")
        else:
            print(f"\n❌ Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
