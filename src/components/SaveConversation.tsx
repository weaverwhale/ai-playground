import { ExtendedChatCompletionMessageParam } from '../../shared/types';

export const SaveLoadConversation = ({
  messages,
  setMessages,
  whichIcons,
  big,
  showOnHover,
  isLoading,
}: {
  messages: ExtendedChatCompletionMessageParam[];
  setMessages: (messages: ExtendedChatCompletionMessageParam[]) => void;
  whichIcons: ('save' | 'load')[];
  big?: boolean;
  showOnHover?: boolean;
  isLoading?: boolean;
}) => {
  const saveConversation = () => {
    const fileName = `conversation-${Date.now()}.json`;
    const blob = new Blob([JSON.stringify(messages, null, 2)], {
      type: 'application/json',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const loadConversation = () => {
    const file = document.createElement('input');
    file.type = 'file';
    file.accept = '.json';

    file.onchange = (e: Event) => {
      const target = e.target as HTMLInputElement;
      if (!target.files?.length) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const result = event.target?.result;
        if (typeof result === 'string') {
          setMessages(JSON.parse(result));
        }
      };
      reader.readAsText(target.files[0]);
    };
    file.click();
  };

  return (
    <div
      className={`
        save-load-conversation 
        ${showOnHover ? 'show-on-hover' : ''}
        ${isLoading ? 'disabled' : ''}
        ${big ? 'big' : ''}
      `}
    >
      {whichIcons.includes('save') && (
        <button title="Save conversation" onClick={() => saveConversation()}>
          💾
        </button>
      )}
      {whichIcons.includes('load') && (
        <button
          title="Load saved conversation"
          onClick={() => loadConversation()}
        >
          ⬇️
        </button>
      )}
    </div>
  );
};
