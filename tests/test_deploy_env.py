"""Deployment dotenv parsing must work on macOS and Linux without executing values."""
from pathlib import Path
import subprocess


def test_deploy_env_reader(tmp_path):
    source = (Path(__file__).resolve().parents[1] / 'scripts/deploy_cloudrun.sh').read_text()
    reader = source[source.index('env_value()'):source.index('RUNTIME_SA=')]
    env_file = tmp_path / '.env'
    env_file.write_text('DEMO_TOKEN=old\n  export DEMO_TOKEN = "literal-$(false)-value"  \n')
    result = subprocess.run(['bash', '-c', reader + '\nENV_FILE="$1"\nenv_value DEMO_TOKEN', 'test', str(env_file)], text=True, capture_output=True, check=True)
    assert result.stdout.strip() == 'literal-$(false)-value'
