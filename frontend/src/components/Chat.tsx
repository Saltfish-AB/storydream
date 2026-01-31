import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Send, Loader2, MessageSquare, Plus, ImagePlus, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ImageAttachment } from '../types';

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
  attachments?: ImageAttachment[];
}

interface ChatProps {
  messages: Message[];
  isLoading: boolean;
  onSendMessage: (content: string, attachments?: ImageAttachment[]) => void;
}

export function Chat({ messages, isLoading, onSendMessage }: ChatProps) {
  const [input, setInput] = useState('');
  const [attachments, setAttachments] = useState<ImageAttachment[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/')) continue;

      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        // Remove the data URI prefix (e.g., "data:image/jpeg;base64,")
        const base64Data = result.split(',')[1];

        setAttachments((prev) => [
          ...prev,
          {
            type: 'image',
            data: base64Data,
            mediaType: file.type,
            name: file.name,
          },
        ]);
      };
      reader.readAsDataURL(file);
    }

    // Reset file input so the same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() || attachments.length > 0) {
      onSendMessage(input.trim(), attachments.length > 0 ? attachments : undefined);
      setInput('');
      setAttachments([]);
    }
  };

  return (
    <div className="flex flex-col h-full bg-card border-l">
      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="text-center py-8 text-muted-foreground">
              <MessageSquare className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>Describe the video you want to create...</p>
            </div>
          )}

          {messages.map((message, index) => (
            <div
              key={index}
              className={cn(
                'flex',
                message.role === 'user'
                  ? 'justify-end'
                  : message.role === 'system'
                  ? 'justify-center'
                  : 'justify-start'
              )}
            >
              <div
                className={cn(
                  'rounded-xl px-4 py-2 text-sm',
                  message.role === 'user' && 'max-w-[80%] bg-primary text-primary-foreground',
                  message.role === 'assistant' && 'max-w-[80%] bg-muted text-foreground',
                  message.role === 'system' && 'max-w-[90%] bg-amber-50 text-amber-800 border border-amber-200'
                )}
              >
                {message.attachments && message.attachments.length > 0 && (
                  <div className="flex flex-wrap gap-2 mb-2">
                    {message.attachments.map((att, i) => (
                      <img
                        key={i}
                        src={`data:${att.mediaType};base64,${att.data}`}
                        alt={att.name || 'Attached image'}
                        className="max-w-[200px] max-h-[150px] rounded-lg object-cover"
                      />
                    ))}
                  </div>
                )}
                {message.content && (
                  <pre className="whitespace-pre-wrap font-sans">
                    {message.content}
                  </pre>
                )}
              </div>
            </div>
          ))}

          {isLoading && messages[messages.length - 1]?.role !== 'assistant' && (
            <div className="flex justify-start">
              <div className="rounded-xl px-4 py-2 bg-muted text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Thinking...</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <form onSubmit={handleSubmit} className="p-4 border-t">
        {/* Hidden file input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/gif,image/webp"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />

        {/* Attachment previews */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2 mb-3">
            {attachments.map((att, index) => (
              <div key={index} className="relative group">
                <img
                  src={`data:${att.mediaType};base64,${att.data}`}
                  alt={att.name || 'Attachment'}
                  className="w-16 h-16 rounded-lg object-cover border"
                />
                <button
                  type="button"
                  onClick={() => removeAttachment(index)}
                  className="absolute -top-2 -right-2 w-5 h-5 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}

        <div className="flex gap-2">
          {/* Plus button with dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="outline" size="icon">
                <Plus className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => fileInputRef.current?.click()}>
                <ImagePlus className="w-4 h-4 mr-2" />
                Add image
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={isLoading ? "Send another message (will be queued)..." : "Describe your video changes..."}
            className="flex-1"
          />
          <Button
            type="submit"
            disabled={!input.trim() && attachments.length === 0}
            size="icon"
          >
            {isLoading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
