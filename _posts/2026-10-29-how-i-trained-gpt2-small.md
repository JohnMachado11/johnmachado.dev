---
title: How I trained GPT-2 small from scratch
summary: I wrote GPT-2 by hand in PyTorch, then trained GPT-2 small (124 million parameters) from random weights on 9.85 billion tokens. It took one rented GPU, 15.6 hours of training, and about $12 of compute in all. On held-out educational web text, it beats OpenAI's original.
tags: [LLMs, PyTorch, Training]
image: /assets/blog/how-i-trained-gpt2-small/share.jpg
styles: [/assets/blog/how-i-trained-gpt2-small/similarity.css]
scripts: [/assets/blog/how-i-trained-gpt2-small/similarity.js]
---

In February 2019, OpenAI released GPT-2 small, a 124-million-parameter language model (117 million in the original paper, [a count OpenAI later said was wrong](https://github.com/openai/gpt-2#gpt-2)). In October 2026, I trained my own from scratch, with code I built. To compare them, I held back 1% of my dataset, 99.6 million tokens of educational web pages, so my model never trained on it. Then I had both models predict each next token across that text. Mine averaged a loss of **3.05**, and OpenAI's averaged **3.30**.

This post covers the code, the data, a PyTorch bug I hit along the way, the overnight run, what the model learned, and what it all cost.

## From one book to 10 billion tokens

The project started with a 6.8-million-parameter model trained on *The War of the Worlds* in about a minute on my M1 Pro MacBook. [The code](https://github.com/JohnMachado11/GPT-2) is written to be read, with one small file per part and plain names (`token_embedding`, not `wte`). OpenAI's GPT-2 small weights also load into it and give the same outputs as Hugging Face's implementation, to within 1e-13 in 64-bit math (0.0000000000001), which confirms the architecture matches GPT-2's exactly.

Scaling up from one book to 10 billion tokens meant rebuilding the training pipeline piece by piece. The biggest changes:

- **Tokenize once.** Ten billion tokens can't be re-tokenized every run or held in memory, so the text is tokenized one time into files of 2-byte tokens, which take 20 GB on disk instead of 80 GB as PyTorch's default 64-bit integers.
- **Read straight off disk.** Batches come from memory-mapped files, so the data never has to fit in RAM.
- **Gradient accumulation.** A 524,288-token batch doesn't fit on the GPU at once, so each step adds up the gradients of 32 smaller batches before it updates the weights.
- **Survive disconnects.** Google Colab can drop a session at any time, so data prep and training both pick up where they stopped.
- **Speed.** bf16 math, FlashAttention, and `torch.compile` (more on that last one below).

## The data

The model learned from [FineWeb-Edu](https://huggingface.co/datasets/HuggingFaceFW/fineweb-edu), a set of Common Crawl web pages that Hugging Face filtered for educational quality. I used its 10-billion-token sample, pinned to one exact version so a prep resumed days later reads the same pages. Every 100th page, whole, was held back for validation and never used in training.

Prep took about two hours on the Colab machine's 12 CPU cores. It streams pages from Hugging Face, tokenizes them with GPT-2's tokenizer, marks where each page ends, and writes 99 training files and 10 validation files straight to Google Drive. Training then reads the files once, in order, over 18,794 steps of 524,288 tokens. Since the model never sees the same text twice, there's little to overfit, so dropout is off.

## The recipe

Most of the settings come from the [GPT-3 paper](https://arxiv.org/abs/2005.14165)'s recipe for its 125M model:

| Setting | Value |
|---|---|
| Batch | 524,288 tokens per step (16 sequences of 1,024 tokens, accumulated 32 times) |
| Learning rate | warmup over 715 steps to 6e-4, then a cosine curve down to 6e-5 |
| Optimizer | AdamW, betas (0.9, 0.95), weight decay 0.1 on the 2-D weights |
| Gradient cap | total gradient norm at most 1.0 |
| Dropout | 0.0 (the GPT-3 paper doesn't give one; nanoGPT and llm.c use 0.0) |

## Testing before spending money

Before paying for GPU time, I tested everything on my Mac, and that turned up a real PyTorch bug. A practice run with `torch.compile` on the Mac's GPU ended at a validation loss of 5.92, while the same run without it reached 5.70. Tracking it down showed that on Apple GPUs, PyTorch's compiler fused two operations incorrectly, which made the position-embedding gradient too big by a factor of the batch size. It turned out to be a known bug, already [reported to PyTorch](https://github.com/pytorch/pytorch/issues/201455) and since fixed in its development code. The repo now refuses to use `torch.compile` on a Mac GPU.

The full-size model did run on my M1 Pro, but only at about 1,750 tokens per second, with 23 GB of swap on a 16 GB laptop. At that speed, 9.85 billion tokens would take more than two months, so the real run went to a rented NVIDIA A100 (40 GB) on Google Colab Pro+.

The final rehearsal took about 35 minutes on the A100 itself, covering a small slice of data, a GPU check, and a short practice run.

- FlashAttention really runs, and the compiled model's gradients match the plain model's to within 1.7 millionths.
- It trains at about 176,000 tokens per second, using 14 GB of the GPU's 40 GB.
- I stopped it at step 110 and restarted it, and it resumed at step 100 with the same losses as before, to four decimal places.

## The run

Training ran overnight for 15.6 hours, from about 3:20 PM on October 23 to 7 AM the next morning, at a steady 176,000 tokens per second with the GPU 99% busy.

<figure>
  <picture>
    <source media="(max-width: 560px)" srcset="/assets/blog/how-i-trained-gpt2-small/loss-phone.svg" width="358" height="300" />
    <img src="/assets/blog/how-i-trained-gpt2-small/loss.svg" width="720" height="400" loading="lazy" decoding="async" alt="Line chart of loss over the run. Training and validation loss start near 11, just above random guessing at 10.82, fall steeply to about 4 within the first half-billion tokens, then slope slowly down to 3.01 by 9.85 billion tokens." />
  </picture>
  <figcaption>Loss over the whole run, from the run's own records. Validation loss is checked every 250 steps on the same held-out text.</figcaption>
</figure>

The loss falls off a cliff in the first half-billion tokens, from 10.96 (no better than random guessing) to 4.12, as the model picks up the basics of English. The remaining 9.3 billion tokens bring it down slowly, from 4.12 to 3.01. The last check was the best one, so the model was still improving when the data ran out. The training loss wobbles, most likely because the files are read in order and the text drifts through different years of the web crawl; the validation loss, measured on the same text every time, stays smooth.

Partway through, the Colab page said "Saving failed," and later "disconnected," but the training kept running on the GPU. I kept an eye on it from Colab's terminal instead, with `nvidia-smi` and the timestamps on the saved checkpoints.

## The score

After training, I scored my model and OpenAI's GPT-2 small on the exact same 99,631,104 held-out tokens, which took 27 minutes:

| Model | Validation loss | Perplexity |
|---|---|---|
| My GPT-2 small | **3.05** | **21.2** |
| OpenAI's GPT-2 small (2019) | 3.30 | 27.0 |

In perplexity terms, my model is about as unsure of each next token as if it were choosing among 21 equally likely options, and OpenAI's among 27. (The run's final check showed 3.01 because it uses only a small slice of the held-out text; 3.05 is the score on all of it.)

Both models are the same size and architecture, so the difference most likely comes from the data and the recipe. FineWeb-Edu is filtered for educational quality, while OpenAI's 2019 training set, WebText, was about 40 GB of text from 8 million web pages linked from Reddit. Most of my settings also come from the GPT-3 paper, which came out more than a year after GPT-2. The comparison does favor my model, though, because the held-out text is FineWeb-Edu, the kind of text it trained on and OpenAI's didn't. Mine is better at predicting educational web text, which isn't the same as being better at everything.

## What it learned

Before training, the model's top guesses for the next token are noise. After training, they make sense:

| Prompt | Before training | After training |
|---|---|---|
| "In this lesson, we will learn" | "akh" 0.022%, "interface" 0.015%, "Brittany" 0.014% | "how" 36.0%, "about" 27.3%, "the" 10.5% |
| "The Martians" | "dump" 0.017%, "adhesive" 0.015%, "analyze" 0.015% | "were" 9.6%, "," 7.6%, "are" 5.5% |

With the prompt in bold, here's what the untrained model writes:

> **In this lesson, we will learn** contraceptive bull 75 aheadarchingatted congratulations exileditairepees point663akh 171 Hull 03 point FROM ADHD1027…

And the trained model, from the same prompt:

> **In this lesson, we will learn** some useful and practical concepts relating to the topic of water chemistry.

It also learned which words mean similar things. In GPT-2 small, each token is a row of 768 numbers, and related words should end up pointing in similar directions. Cosine similarity measures this from the angle between two rows, on a scale from −1 to 1:

- **1** means the rows point the same way (0° apart)
- **0** means they're unrelated (90° apart)
- **−1** means they point in opposite directions (180° apart)

Before training, the rows are random, so almost every pair sits near 0, unrelated. Training pulls related words toward 1. Monday and Tuesday ended at 0.85 (32° apart), seven and eight at 0.80 (37°), and red and blue at 0.47 (62°).

<figure class="sim">
  <svg class="sim-defs" width="0" height="0" aria-hidden="true"><defs><marker id="sim-head-first" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path class="sim-head-first" d="M0,0 L8,4 L0,8 z"/></marker><marker id="sim-head-before" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path class="sim-head-before" d="M0,0 L8,4 L0,8 z"/></marker><marker id="sim-head-after" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="6" markerHeight="6" orient="auto"><path class="sim-head-after" d="M0,0 L8,4 L0,8 z"/></marker></defs></svg>
  <div class="sim-pairs">
    <div class="sim-pair" data-before="0.00" data-after="0.85"><svg viewBox="0 -24 196 142" aria-hidden="true"><path class="sim-arc" d="M42,100 A28,28 0 0 0 37.8,85.3"/><line class="sim-before" x1="14" y1="100" x2="14.0" y2="4.0" marker-end="url(#sim-head-before)"/><line class="sim-first" x1="14" y1="100" x2="126" y2="100" marker-end="url(#sim-head-first)"/><line class="sim-after" x1="14" y1="100" x2="95.6" y2="49.4" marker-end="url(#sim-head-after)"/><text class="sim-label-start" x="14.0" y="-5.0">start</text><text class="sim-label-first" x="126" y="115">Monday</text><text class="sim-label-second" x="101.6" y="52.4">Tuesday</text><text class="sim-label-angle" x="53.4" y="88.8">32°</text></svg><div><p class="sim-words">Monday · Tuesday</p><p class="sim-vals"><span class="sim-key">cosine</span> 0.00 → <strong>0.85</strong></p><p class="sim-angle"><span class="sim-key">angle</span> 90° → 32°</p></div></div>
    <div class="sim-pair" data-before="-0.01" data-after="0.80"><svg viewBox="0 -24 196 142" aria-hidden="true"><path class="sim-arc" d="M42,100 A28,28 0 0 0 36.4,83.2"/><line class="sim-before" x1="14" y1="100" x2="13.0" y2="4.0" marker-end="url(#sim-head-before)"/><line class="sim-first" x1="14" y1="100" x2="126" y2="100" marker-end="url(#sim-head-first)"/><line class="sim-after" x1="14" y1="100" x2="90.8" y2="42.4" marker-end="url(#sim-head-after)"/><text class="sim-label-start" x="13.0" y="-5.0">start</text><text class="sim-label-first" x="126" y="115">seven</text><text class="sim-label-second" x="96.8" y="45.4">eight</text><text class="sim-label-angle" x="52.9" y="87.0">37°</text></svg><div><p class="sim-words">seven · eight</p><p class="sim-vals"><span class="sim-key">cosine</span> −0.01 → <strong>0.80</strong></p><p class="sim-angle"><span class="sim-key">angle</span> 91° → 37°</p></div></div>
    <div class="sim-pair" data-before="-0.06" data-after="0.47"><svg viewBox="0 -24 196 142" aria-hidden="true"><path class="sim-arc" d="M42,100 A28,28 0 0 0 27.2,75.3"/><line class="sim-before" x1="14" y1="100" x2="8.2" y2="4.2" marker-end="url(#sim-head-before)"/><line class="sim-first" x1="14" y1="100" x2="126" y2="100" marker-end="url(#sim-head-first)"/><line class="sim-after" x1="14" y1="100" x2="59.1" y2="15.3" marker-end="url(#sim-head-after)"/><text class="sim-label-start" x="12.0" y="-4.8">start</text><text class="sim-label-first" x="126" y="115">red</text><text class="sim-label-second" x="65.1" y="18.3">blue</text><text class="sim-label-angle" x="49.2" y="78.9">62°</text></svg><div><p class="sim-words">red · blue</p><p class="sim-vals"><span class="sim-key">cosine</span> −0.06 → <strong>0.47</strong></p><p class="sim-angle"><span class="sim-key">angle</span> 93° → 62°</p></div></div>
  </div>
  <figcaption>Each drawing shows one pair's angle: dashed where the second word started, cyan where it ended up after training.</figcaption>
</figure>

Facts are hit or miss at this size. Given `France: Paris / Italy: Rome / Spain:`, it answers Madrid, just like OpenAI's GPT-2 small. But both also say Canada's capital is Montreal and Australia's is Sydney, naming a well-known city instead of the capital. With random sampling, mine once announced that Paris is the capital of the United States. As a base model, it continues text rather than looking facts up, and it isn't a chatbot.

## Sharing it

The trained weights are on [Hugging Face](https://huggingface.co/John-Machado/gpt2-small-fineweb-edu) under the MIT license. To publish them, an export script renames every weight to GPT-2's original names (`token_embedding` becomes `transformer.wte`), saves them in the standard safetensors format, and checks that the converted model gives the same outputs before saving. Anyone can load it with the `transformers` library:

```python
from transformers import AutoModelForCausalLM, AutoTokenizer

model = AutoModelForCausalLM.from_pretrained("John-Machado/gpt2-small-fineweb-edu")
tokenizer = AutoTokenizer.from_pretrained("John-Machado/gpt2-small-fineweb-edu")

ids = tokenizer("The water cycle is", return_tensors="pt").input_ids
out = model.generate(ids, max_new_tokens=40, do_sample=True, top_k=50, pad_token_id=tokenizer.eos_token_id)
print(tokenizer.decode(out[0]))
```

To train your own copy, [the repo's README](https://github.com/JohnMachado11/GPT-2#train-gpt-2-small-from-scratch) walks through every step of this run on Colab.

## What it cost

| Step | Time | Colab compute units |
|---|---|---|
| GPU check and practice run | about 35 min | ~4 |
| Data prep | about 2 h | ~15 |
| Training | 15.6 h | ~83 |
| Scoring against OpenAI's model | 27 min | ~2.5 |
| Idle time between steps | | ~10 |
| **Total** | **about 19 h, ~20 min of it hands-on** | **~115, about $12** |

Colab Pro+ costs $50 a month and includes 500 compute units, so the whole project used about a quarter of one month's units.

## What's next

Next, I plan to train the bigger GPT-2 sizes, each on at least ~20 tokens per parameter. Medium reuses the same 10 billion tokens, a bit more than its ideal ~7 billion. Large and XL need more data, about 15 billion and 31 billion tokens. My rough estimates, scaled from this run:

| Size | Parameters | GPU time | GPU cost (est.) |
|---|---|---|---|
| Medium | 355M | ~44 A100-hours | ~$23 |
| Large | 774M | ~150 A100-hours | ~$80 |
| XL | 1.56B | ~590 A100-hours | ~$310 |

Costs at Colab's A100 rate (~$0.53 an hour); rented GPUs elsewhere price differently.

Medium is next, on the same data. XL is a bigger jump. On one GPU it would take about 12 days even on an H100, so it really wants a machine with several GPUs and the multi-GPU code to use it.
