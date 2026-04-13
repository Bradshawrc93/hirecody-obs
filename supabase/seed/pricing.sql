-- Seed model_pricing with current public per-1K-token prices.
-- Source: Anthropic + OpenAI pricing pages, as of 2026-04-13.
-- Numbers are USD per 1,000 tokens. To update: insert a new row with a
-- newer effective_from — never edit an existing row, so historical costs
-- stay immutable.

insert into public.model_pricing (provider, model, input_per_1k_usd, output_per_1k_usd, effective_from) values
  -- Anthropic — Claude 4.6 family
  ('anthropic', 'claude-opus-4-6',   0.015, 0.075, '2026-01-01'),
  ('anthropic', 'claude-sonnet-4-6', 0.003, 0.015, '2026-01-01'),
  ('anthropic', 'claude-haiku-4-5',  0.001, 0.005, '2026-01-01'),
  -- OpenAI — GPT-4o family
  ('openai',    'gpt-4o',            0.005, 0.015, '2026-01-01'),
  ('openai',    'gpt-4o-mini',       0.00015, 0.0006, '2026-01-01'),
  ('openai',    'gpt-4-turbo',       0.01,  0.03,  '2026-01-01')
on conflict do nothing;
