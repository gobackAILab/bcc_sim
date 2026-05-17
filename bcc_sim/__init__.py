from pathlib import Path


def _read_version() -> str:
    # 1) 설치된 패키지 메타데이터 우선 (배포된 경우)
    try:
        from importlib.metadata import PackageNotFoundError, version as _v
        try:
            return _v("bcc-sim")
        except PackageNotFoundError:
            pass
    except ImportError:
        pass
    # 2) 소스 트리에서 pyproject.toml 읽기 (editable/uv sync 환경)
    try:
        import tomllib  # Python 3.11+
        pyproject = Path(__file__).resolve().parent.parent / "pyproject.toml"
        with open(pyproject, "rb") as f:
            return tomllib.load(f)["project"]["version"]
    except Exception:
        return "0.0.0+dev"


__version__ = _read_version()
