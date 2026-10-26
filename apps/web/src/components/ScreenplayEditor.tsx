import { useEffect, useMemo, useState } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import type { Editor } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import CollaborationCaret from '@tiptap/extension-collaboration-caret';
import Placeholder from '@tiptap/extension-placeholder';
import {
  HocuspocusProviderWebsocketComponent,
  HocuspocusRoom,
  useHocuspocusProvider,
  useHocuspocusAwareness,
  useHocuspocusConnectionStatus,
  useHocuspocusSyncStatus,
} from '@hocuspocus/provider-react';
import {
  Bold, Italic, Users, Wifi, WifiOff, Cloud, LockKeyhole,
  AlignLeft, Undo2, Redo2, TextCursorInput,
} from 'lucide-react';

const kinds = [
  { value: 'heading', label: 'Заголовок сцены' },
  { value: 'action', label: 'Действие' },
  { value: 'character', label: 'Персонаж' },
  { value: 'dialogue', label: 'Реплика' },
  { value: 'parenthetical', label: 'Ремарка' },
  { value: 'transition', label: 'Переход' },
] as const;
type BlockKind = (typeof kinds)[number]['value'];
const allowedKinds = new Set<string>(kinds.map(kind => kind.value));

/** Canonical rich-text CRDT node; no parallel JSON/plain-text copies in Scene.synopsis. */
const ScreenplayBlock = Node.create({
  name: 'screenplayBlock',
  group: 'block',
  content: 'inline*',
  defining: true,
  addAttributes() {
    return {
      kind: {
        default: 'action',
        parseHTML: element => {
          const kind = element.getAttribute('data-kind') ?? 'action';
          return allowedKinds.has(kind) ? kind : 'action';
        },
        renderHTML: attrs => ({ 'data-kind': attrs.kind }),
      },
    };
  },
  parseHTML() { return [{ tag: 'p[data-screenplay-block]' }]; },
  renderHTML({ HTMLAttributes }) {
    return ['p', mergeAttributes({ 'data-screenplay-block': 'true' }, HTMLAttributes), 0];
  },
  addKeyboardShortcuts() {
    return {
      'Mod-Alt-1': () => this.editor.commands.updateAttributes(this.name, { kind: 'heading' }),
      'Mod-Alt-2': () => this.editor.commands.updateAttributes(this.name, { kind: 'action' }),
      'Mod-Alt-3': () => this.editor.commands.updateAttributes(this.name, { kind: 'character' }),
      'Mod-Alt-4': () => this.editor.commands.updateAttributes(this.name, { kind: 'dialogue' }),
      'Mod-Alt-5': () => this.editor.commands.updateAttributes(this.name, { kind: 'parenthetical' }),
      'Mod-Alt-6': () => this.editor.commands.updateAttributes(this.name, { kind: 'transition' }),
    };
  },
});

function wsUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return protocol + '//' + window.location.host + '/collab';
}
function memberColor(userId: string): string {
  const palette = ['#df8866', '#8f7bc5', '#69a3a0', '#aa829a', '#75a3be', '#c08d55'];
  const index = Array.from(userId).reduce((sum, char) => sum + char.charCodeAt(0), 0) % palette.length;
  return palette[index];
}

export function ScreenplayEditor({
  sceneId, token, displayName, userId,
}: { sceneId: string; token: string; displayName: string; userId: string }) {
  const [failure, setFailure] = useState('');
  const url = useMemo(wsUrl, []);
  return <section className="collab-editor" aria-label="Совместный редактор текста сцены">
    <HocuspocusProviderWebsocketComponent url={url}>
      <HocuspocusRoom
        key={sceneId}
        name={'scene:' + sceneId}
        token={token}
        onAuthenticationFailed={() => setFailure('Нет доступа к документу или срок действия входа закончился. Обновите страницу и войдите снова.')}
      >
        {failure
          ? <p className="collab-error" role="alert">{failure}</p>
          : <EditorSurface displayName={displayName} userId={userId}/>}
      </HocuspocusRoom>
    </HocuspocusProviderWebsocketComponent>
  </section>;
}

function EditorSurface({ displayName, userId }: { displayName: string; userId: string }) {
  const provider = useHocuspocusProvider();
  const connection = useHocuspocusConnectionStatus();
  const sync = useHocuspocusSyncStatus();
  const audience = useHocuspocusAwareness();
  const [authorizedScope, setAuthorizedScope] = useState<string | null>(provider.authorizedScope ?? null);
  const [synced, setSynced] = useState(provider.synced);
  const [selectionKind, setSelectionKind] = useState<BlockKind>('action');
  const color = useMemo(() => memberColor(userId), [userId]);
  const canWrite = connection === 'connected' && synced && authorizedScope === 'read-write';
  useEffect(() => {
    const onAuth = ({ scope }: { scope: string }) => setAuthorizedScope(scope);
    const onSynced = () => setSynced(true);
    const onClose = () => setSynced(false);
    provider.on('authenticated', onAuth);
    provider.on('synced', onSynced);
    provider.on('close', onClose);
    setAuthorizedScope(provider.authorizedScope ?? null);
    setSynced(provider.synced);
    return () => {
      provider.off('authenticated', onAuth);
      provider.off('synced', onSynced);
      provider.off('close', onClose);
    };
  }, [provider]);

  const extensions = useMemo(() => [
    StarterKit.configure({
      paragraph: false,
      heading: false,
      undoRedo: false,
    }),
    ScreenplayBlock,
    Collaboration.configure({ document: provider.document, field: 'screenplay' }),
    CollaborationCaret.configure({
      provider,
      user: { name: displayName, color },
    }),
    Placeholder.configure({ placeholder: 'Начните писать сцену…' }),
  ], [provider, displayName, color]);

  const editor = useEditor({
    extensions,
    immediatelyRender: false,
    editable: false,
    editorProps: {
      attributes: {
        class: 'screenplay-prosemirror',
        'aria-label': 'Сценарный текст',
        spellcheck: 'true',
      },
    },
  }, [extensions]);

  useEffect(() => {
    editor?.setEditable(canWrite);
  }, [editor, canWrite]);
  useEffect(() => {
    if (!editor) return;
    const update = () => {
      const next = editor.getAttributes('screenplayBlock').kind as string | undefined;
      if (next && allowedKinds.has(next)) setSelectionKind(next as BlockKind);
    };
    editor.on('selectionUpdate', update);
    editor.on('transaction', update);
    update();
    return () => {
      editor.off('selectionUpdate', update);
      editor.off('transaction', update);
    };
  }, [editor]);

  return <>
    <div className="collab-topbar">
      <div className="collab-heading"><TextCursorInput size={16}/><strong>Текст сценария</strong>
        <span className="collab-subtitle">Синхронизация через Yjs</span></div>
      <div className="collab-status" role="status" aria-live="polite">
        {connection !== 'connected'
          ? <><WifiOff size={14}/> {connection === 'connecting' ? 'Подключаемся…' : 'Нет подключения'}</>
          : !synced ? <><Cloud size={14}/> Загружаем документ…</>
          : authorizedScope === 'readonly' ? <><LockKeyhole size={14}/> Только чтение</>
          : <><Wifi size={14}/> {sync === 'syncing' ? 'Синхронизируем…' : 'Синхронизировано'}</>}
      </div>
    </div>
    <div className="collab-toolbar" aria-label="Форматирование">
      <label className="block-select">
        <span className="sr-only">Тип сценарного блока</span>
        <AlignLeft size={16}/>
        <select aria-label="Тип сценарного блока" value={selectionKind} disabled={!editor || !canWrite}
          onChange={event => {
            const kind = event.target.value as BlockKind;
            editor?.chain().focus().updateAttributes('screenplayBlock', { kind }).run();
            setSelectionKind(kind);
          }}>
          {kinds.map(kind => <option key={kind.value} value={kind.value}>{kind.label}</option>)}
        </select>
      </label>
      <div className="toolbar-divider"/>
      <ToolbarButton label="Полужирный" active={editor?.isActive('bold')} disabled={!canWrite}
        action={() => editor?.chain().focus().toggleBold().run()}><Bold size={16}/></ToolbarButton>
      <ToolbarButton label="Курсив" active={editor?.isActive('italic')} disabled={!canWrite}
        action={() => editor?.chain().focus().toggleItalic().run()}><Italic size={16}/></ToolbarButton>
      <div className="toolbar-divider"/>
      <ToolbarButton label="Отменить" disabled={!canWrite || !editor?.can().undo()}
        action={() => editor?.commands.undo()}><Undo2 size={16}/></ToolbarButton>
      <ToolbarButton label="Повторить" disabled={!canWrite || !editor?.can().redo()}
        action={() => editor?.commands.redo()}><Redo2 size={16}/></ToolbarButton>
    </div>
    <div className={'collab-document' + (!canWrite ? ' is-readonly' : '')}>
      <EditorContent editor={editor}/>
      {!canWrite && <span className="collab-readonly">
        {authorizedScope === 'readonly'
          ? 'У вас доступ только на чтение'
          : 'Редактирование станет доступно после безопасного подключения'}
      </span>}
    </div>
    <footer className="collab-footer">
      <span className="collab-hint">Ctrl + Alt + 1–6 — тип блока · Ctrl + B — жирный</span>
      <span className="collab-participants"><Users size={14}/> {Math.max(audience.length, 1)} в документе</span>
    </footer>
  </>;
}

function ToolbarButton({ label, active, disabled, action, children }: {
  label: string; active?: boolean; disabled?: boolean;
  action: () => void; children: React.ReactNode;
}) {
  return <button type="button" className={'format-button' + (active ? ' active' : '')}
    onClick={action} disabled={disabled} title={label} aria-label={label} aria-pressed={Boolean(active)}>{children}</button>;
}
