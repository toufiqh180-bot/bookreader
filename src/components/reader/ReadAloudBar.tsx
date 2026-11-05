/**
 * The read-aloud player, floating above the page bar while reading: previous
 * and next sentence, play/pause, speed, voice and stop. Moving anywhere in the
 * book while it plays carries the reading there (see app/read-aloud.ts).
 */
import { useEffect, useState } from 'react';
import { Check, Download, Loader2, Pause, Play, SkipBack, SkipForward, X } from 'lucide-react';
import { DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/cn';
import { IconButton } from '../common/IconButton.tsx';
import { pill } from './pill.ts';
import { useApp, useAppState, useCommand } from '../../hooks/use-app.ts';
import { SPEECH_RATES, type ReadAloudState } from '../../app/read-aloud.ts';
import { preferredVoices, type SpeechVoice } from '../../services/speech/engine.ts';

const formatRate = (rate: number) => `${rate}×`;
const percent = (loaded: number, total: number) => (total ? Math.min(99, Math.round((loaded / total) * 100)) : 0);

export function ReadAloudBar() {
  const state = useAppState();
  const run = useCommand();
  const speech = state.readAloud;
  if (!state.book || speech.status === 'idle') return null;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <StatusLine speech={speech} />
      <div className={pill} role="group" aria-label="Read aloud">
        {speech.needsDownload ? (
          <DownloadPrompt speech={speech} />
        ) : (
          <>
            <IconButton label="Previous sentence" tooltipSide="top" className="size-9 rounded-full" onClick={() => run('speech.previous')}>
              <SkipBack />
            </IconButton>
            <Button
              size="icon"
              aria-label={speech.status === 'playing' ? 'Pause' : 'Play'}
              title={speech.status === 'playing' ? 'Pause (R)' : 'Play (R)'}
              className="size-9 rounded-full [&_svg]:size-[18px]"
              onClick={() => run('speech.toggle')}
            >
              {speech.loading ? <Loader2 className="animate-spin" /> : speech.status === 'playing' ? <Pause /> : <Play />}
            </Button>
            <IconButton label="Next sentence" tooltipSide="top" className="size-9 rounded-full" onClick={() => run('speech.next')}>
              <SkipForward />
            </IconButton>
            <div className="mx-1 h-5 w-px bg-border" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label="Reading speed" className="h-8 min-w-11 rounded-full px-2 font-medium tabular-nums hover:bg-muted">
                  {formatRate(speech.rate)}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent side="top" align="center" className="w-32">
                {SPEECH_RATES.map((rate) => (
                  <DropdownMenuCheckboxItem key={rate} checked={speech.rate === rate} onClick={() => run('speech.rate', rate)}>
                    {formatRate(rate)}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <VoicePicker speech={speech} />
          </>
        )}
        <IconButton label="Stop reading" tooltipSide="top" className="size-9 rounded-full" onClick={() => run('speech.stop')}>
          <X />
        </IconButton>
      </div>
    </div>
  );
}

/** What the player is waiting for, a notice or an error, in a bubble above it. */
function StatusLine({ speech }: { speech: ReadAloudState }) {
  const { download } = speech;
  let text: string | null = null;
  if (speech.error) text = speech.error;
  else if (speech.needsDownload) text = `The natural voice needs a one-time ${speech.naturalDownloadMb} MB download, then it works offline.`;
  else if (speech.loading && download.status === 'loading') {
    text = download.total ? `Downloading natural voice… ${percent(download.loaded, download.total)}%` : 'Preparing natural voice…';
  } else if (speech.loading) text = 'Preparing voice…';
  else if (speech.notice) text = speech.notice;
  if (!text) return null;
  return (
    <div
      className={cn(
        'pointer-events-auto max-w-[min(92vw,420px)] rounded-full border bg-popover/90 px-3 py-1 text-center text-xs shadow-floating backdrop-blur-xl',
        speech.error ? 'text-destructive' : 'text-muted-foreground',
      )}
    >
      {text}
    </div>
  );
}

/** Shown when the natural voice is chosen but not downloaded yet: asks before the download (size in the bubble above). */
function DownloadPrompt({ speech }: { speech: ReadAloudState }) {
  const run = useCommand();
  return (
    <div className="flex items-center gap-1">
      <Button size="sm" className="h-8 rounded-full" onClick={() => run('speech.download')}>
        <Download /> Download voice
      </Button>
      {speech.systemAvailable && (
        <Button size="sm" variant="ghost" className="h-8 rounded-full" onClick={() => run('speech.engine', 'system')}>
          Device voice
        </Button>
      )}
    </div>
  );
}

/** Device or natural voice, and which voice. */
function VoicePicker({ speech }: { speech: ReadAloudState }) {
  const app = useApp();
  const run = useCommand();
  const [open, setOpen] = useState(false);
  const [voices, setVoices] = useState<SpeechVoice[]>([]);

  useEffect(() => {
    if (!open) return;
    let current = true;
    void app.readAloud.engine.voices().then((list) => current && setVoices(list));
    return () => {
      current = false;
    };
  }, [open, app, speech.engine]);

  // Device voices can number in the hundreds: show the reader's language (English as a fallback).
  const shown = speech.engine === 'natural' ? voices : preferredVoices(voices);
  const selected = speech.voice ?? shown[0]?.id;
  const { download } = speech;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className="h-8 rounded-full px-2.5 font-medium hover:bg-muted">
          Voice
        </button>
      </PopoverTrigger>
      <PopoverContent side="top" align="end" className="flex w-80 flex-col gap-3 p-3 text-[13px]">
        <ToggleGroup
          type="single"
          variant="outline"
          value={speech.engine}
          onValueChange={(v) => v && run('speech.engine', v)}
          className="grid w-full grid-cols-2"
        >
          <ToggleGroupItem value="system" disabled={!speech.systemAvailable} className="data-[state=on]:bg-accent data-[state=on]:text-accent-foreground">
            Device voice
          </ToggleGroupItem>
          <ToggleGroupItem value="natural" className="data-[state=on]:bg-accent data-[state=on]:text-accent-foreground">
            Natural voice
          </ToggleGroupItem>
        </ToggleGroup>
        <p className="text-xs text-muted-foreground">
          {speech.engine === 'system'
            ? 'Voices built into this device. Downloading "Enhanced" or "Premium" voices in your system settings makes them sound more natural.'
            : `A lifelike AI voice that runs on this device. English only. ${
                download.status === 'ready' ? 'Works offline.' : `One-time ${speech.naturalDownloadMb} MB download, then it works offline.`
              }${speech.naturalFast ? '' : ' This device runs it on the processor, so it may be too slow to keep up.'}`}
        </p>
        <div className="-mx-1 flex max-h-56 flex-col overflow-y-auto">
          {shown.map((voice) => (
            <button
              key={voice.id}
              type="button"
              onClick={() => run('speech.voice', voice.id)}
              className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left hover:bg-muted"
            >
              <Check className={cn('size-4 shrink-0 text-primary', voice.id !== selected && 'invisible')} />
              <span className="min-w-0 flex-1 truncate">{voice.name}</span>
              <span className="text-xs text-muted-foreground">{voice.lang}</span>
            </button>
          ))}
          {!shown.length && <p className="px-2 py-1.5 text-muted-foreground">No voices found on this device.</p>}
        </div>
      </PopoverContent>
    </Popover>
  );
}
