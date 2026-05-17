// pm2 ecosystem for bcc-sim web
//
// 버전 단일 출처: pyproject.toml
//   - Python: bcc_sim/__init__.py 가 pyproject.toml 을 읽어 __version__ 노출
//   - 웹 API: GET /api/version
//   - 환경변수: BCC_SIM_VERSION
//   (PM2 status 의 version 컬럼은 외부 바이너리 script 사용 시 N/A 가 정상)
//
// usage:
//   pm2 start ecosystem.config.cjs
//   pm2 logs bcc-sim-web
//   pm2 restart bcc-sim-web --update-env
//   pm2 stop bcc-sim-web
//   pm2 save && pm2 startup    # 부팅시 자동 기동

const fs = require("fs");
const path = require("path");

const APP_ROOT = path.resolve(__dirname);

function readPyprojectVersion() {
  try {
    const toml = fs.readFileSync(path.join(APP_ROOT, "pyproject.toml"), "utf-8");
    const m = toml.match(/^\s*version\s*=\s*"([^"]+)"/m);
    return m ? m[1] : "0.0.0";
  } catch (_e) {
    return "0.0.0";
  }
}

const VERSION = readPyprojectVersion();

module.exports = {
  apps: [
    {
      name: "bcc-sim-web",
      cwd: APP_ROOT,
      script: "/home/agent01/.local/bin/uv",
      args: [
        "run",
        "python",
        "-m",
        "bcc_sim.web",
        "--host",
        "0.0.0.0",
        "--port",
        "21037",
      ],
      interpreter: "none",
      autorestart: true,
      max_restarts: 10,
      restart_delay: 3000,
      out_file: "./logs/pm2-out.log",
      error_file: "./logs/pm2-err.log",
      merge_logs: true,
      time: true,
      env: {
        PYTHONUNBUFFERED: "1",
        BCC_SIM_VERSION: VERSION,
      },
    },
  ],
};
