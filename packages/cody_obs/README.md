# cody_obs

Tiny Python client for the Cody observability collector. Symmetric with `@cody/obs-js`.

## Install

```bash
pip install -e packages/cody_obs
# or, once pushed to a git remote:
pip install git+ssh://git@github.com/...#subdirectory=packages/cody_obs
```

## Use (async)

```python
import time
from anthropic import AsyncAnthropic
from cody_obs import ObsConfig, ObsEvent, create_obs

obs = create_obs(ObsConfig(
    endpoint="https://obs.example.com/api/events",
    api_key="...",
    app="rag-experiments",
))

client = AsyncAnthropic()

async def run(prompt: str):
    start = time.monotonic()
    resp = await client.messages.create(
        model="claude-sonnet-4-6",
        max_tokens=1024,
        messages=[{"role": "user", "content": prompt}],
    )
    await obs.log(ObsEvent(
        model="claude-sonnet-4-6",
        provider="anthropic",
        input_tokens=resp.usage.input_tokens,
        output_tokens=resp.usage.output_tokens,
        latency_ms=int((time.monotonic() - start) * 1000),
        prompt=prompt,
        response=resp.content[0].text,
    ))
    return resp
```

## Use (sync)

```python
from cody_obs import ObsConfig, ObsEvent, create_sync_obs

obs = create_sync_obs(ObsConfig(endpoint=..., api_key=..., app="script"))

obs.log(ObsEvent(model="gpt-4o-mini", provider="openai", input_tokens=120, output_tokens=80, latency_ms=420))
obs.close()  # flushes pending dispatches
```
