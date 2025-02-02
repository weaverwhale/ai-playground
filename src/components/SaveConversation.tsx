import { ExtendedChatCompletionMessageParam } from '../../shared/types';

export const SaveLoadConversation = ({
  messages,
  setMessages,
  whichIcons,
  big,
  isLoading,
}: {
  messages: ExtendedChatCompletionMessageParam[];
  setMessages: (messages: ExtendedChatCompletionMessageParam[]) => void;
  whichIcons: ('save' | 'load')[];
  big?: boolean;
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
          try {
            const parsed = JSON.parse(result);
            if (!Array.isArray(parsed)) {
              throw new Error(
                'Invalid format: conversation data is not an array'
              );
            }

            const isValid = parsed.every(
              (item: ExtendedChatCompletionMessageParam) =>
                item &&
                typeof item === 'object' &&
                typeof item.role === 'string' &&
                typeof item.content === 'string'
            );

            if (!isValid) {
              const error =
                'Invalid conversation format: Some messages do not conform';
              alert(error);
              throw new Error(error);
            }

            setMessages(parsed);
          } catch (err) {
            console.error('Error loading conversation:', err);
            alert(
              'Failed to load conversation. Please ensure the file is correctly formatted.'
            );
          }
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
