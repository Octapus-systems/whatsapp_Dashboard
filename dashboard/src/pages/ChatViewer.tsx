import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { 
  Send, 
  Loader2, 
  Search, 
  User, 
  Users, 
  MessageSquare, 
  Clock, 
  Check, 
  CheckCheck, 
  AlertCircle, 
  Image as ImageIcon, 
  Video, 
  FileText, 
  Mic, 
  MapPin, 
  Contact as ContactIcon, 
  Smile, 
  ArrowDown
} from 'lucide-react';
import { chatApi, sessionApi, messageApi, type Session, type Contact, type Group, type Message } from '../services/api';
import { useWebSocket } from '../hooks/useWebSocket';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { useRole } from '../hooks/useRole';
import { PageHeader } from '../components/PageHeader';
import './ChatViewer.css';

interface CombinedChat {
  id: string;
  name: string;
  type: 'personal' | 'group';
  number?: string;
  unread?: boolean;
  lastMessage?: string;
  lastMessageTime?: string;
}

/** Shape of msg.metadata.media for image/video/audio/document messages */
interface MessageMedia {
  url?: string;
  data?: string;
  mimetype?: string;
  filename?: string;
}

/** Shape of msg.metadata.location for location messages */
interface MessageLocation {
  latitude?: number;
  longitude?: number;
  description?: string;
  address?: string;
}

/** Shape of msg.metadata.contact for contact-card messages */
interface MessageContact {
  name?: string;
  number?: string;
}

export function ChatViewer() {
  const { t } = useTranslation();
  useDocumentTitle(t('chatViewer.title', 'Chat Viewer'));
  const { canWrite } = useRole();

  // State
  const [sessions, setSessions] = useState<Session[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string>('');
  const [loadingSessions, setLoadingSessions] = useState(true);

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [loadingChats, setLoadingChats] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [activeChat, setActiveChat] = useState<CombinedChat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [sendingMessage, setSendingMessage] = useState(false);

  const [showScrollBottom, setShowScrollBottom] = useState(false);

  // Refs for scrolling
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  // Always-fresh refs used inside WebSocket callbacks to avoid stale closures
  const activeChatRef = useRef<CombinedChat | null>(null);
  const selectedSessionIdRef = useRef<string>('');
  /**
   * Client-side LID → JID cache: populated whenever the backend sends a WS
   * payload where `from` ends with @lid but `chatId` has already been resolved
   * to @c.us. Acts as a safety net in case an @lid slips through unresolved.
   */
  const lidToJidMapRef = useRef<Map<string, string>>(new Map());

  // Keep refs in sync with state on every render
  useEffect(() => { activeChatRef.current = activeChat; }, [activeChat]);
  useEffect(() => { selectedSessionIdRef.current = selectedSessionId; }, [selectedSessionId]);

  // Get active session status
  const currentSession = sessions.find(s => s.id === selectedSessionId);
  const isSessionReady = currentSession?.status === 'ready';

  // Fetch initial list of sessions
  const fetchSessions = async () => {
    try {
      setLoadingSessions(true);
      const data = await sessionApi.list();
      setSessions(data);
      
      // Auto-select first ready session
      const firstReady = data.find(s => s.status === 'ready');
      if (firstReady) {
        setSelectedSessionId(firstReady.id);
      } else if (data.length > 0) {
        setSelectedSessionId(data[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch sessions:', err);
    } finally {
      setLoadingSessions(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  // Fetch contacts and groups when selected session changes
  const fetchChats = async (sessionId: string) => {
    if (!sessionId) return;
    try {
      setLoadingChats(true);
      setContacts([]);
      setGroups([]);
      setActiveChat(null);
      setMessages([]);

      const [contactsData, groupsData] = await Promise.all([
        chatApi.getContacts(sessionId).catch(() => [] as Contact[]),
        chatApi.getGroups(sessionId).catch(() => [] as Group[])
      ]);

      // Deduplicate by id as a safety net (backend also deduplicates, belt-and-braces)
      const uniqueContacts = Array.from(
        new Map(contactsData.map(c => [c.id, c])).values()
      );
      const uniqueGroups = Array.from(
        new Map(groupsData.map(g => [g.id, g])).values()
      );

      setContacts(uniqueContacts);
      setGroups(uniqueGroups);
    } catch (err) {
      console.error('Failed to fetch chats:', err);
    } finally {
      setLoadingChats(false);
    }
  };

  useEffect(() => {
    if (selectedSessionId && isSessionReady) {
      fetchChats(selectedSessionId);
    } else {
      setContacts([]);
      setGroups([]);
      setActiveChat(null);
      setMessages([]);
    }
  }, [selectedSessionId, isSessionReady]);

  // Fetch message history for selected chat
  const fetchMessages = async (chatId: string) => {
    if (!selectedSessionId || !chatId) return;
    try {
      setLoadingMessages(true);
      const result = await chatApi.getMessages(selectedSessionId, chatId, 100);
      // API returns DESC (newest first) — reverse to ASC for correct top→bottom display
      setMessages([...result.messages].reverse());
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    } finally {
      setLoadingMessages(false);
    }
  };

  useEffect(() => {
    if (activeChat) {
      fetchMessages(activeChat.id);
    }
  }, [activeChat?.id, selectedSessionId]);

  // Auto-scroll to bottom of messages
  const scrollToBottom = (behavior: 'smooth' | 'auto' = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior });
  };

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom('auto');
    }
  }, [messages.length]);

  // Handle scroll detection for the "scroll to bottom" button
  const handleMessagesScroll = () => {
    if (!messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    // Show button if user scrolled up significantly (more than 300px from bottom)
    const isCloseToBottom = scrollHeight - scrollTop - clientHeight < 300;
    setShowScrollBottom(!isCloseToBottom);
  };

  // WebSocket Integration — handlers read state through refs to avoid stale closures
  useWebSocket({
    onSessionStatus: (event) => {
      setSessions(prev =>
        prev.map(s => (s.id === event.sessionId ? { ...s, status: event.status as Session['status'] } : s))
      );
    },
    onMessage: (event) => {
      const currentSessionId = selectedSessionIdRef.current;
      const currentChat = activeChatRef.current;
      const msg = event.message as unknown as {
        id: string;
        from: string;
        to: string;
        body?: string;
        type: string;
        direction?: 'incoming' | 'outgoing';
        fromMe?: boolean;
        timestamp: number;
        metadata?: Record<string, unknown>;
        chatId?: string;
      };

      console.log('[ChatViewer] onMessage fired', {
        eventSessionId: event.sessionId,
        currentSessionId,
        from: msg?.from,
        chatId: msg?.chatId,
        body: msg?.body,
        fromMe: msg?.fromMe,
        direction: msg?.direction,
        activeChatId: currentChat?.id,
      });

      // Drop events for other sessions
      if (event.sessionId !== currentSessionId) {
        console.log('[ChatViewer] Dropping event — wrong session', event.sessionId, '!=', currentSessionId);
        return;
      }

      // ── LID normalisation (client-side safety net) ────────────────────────────
      // The adapter already resolves @lid → @c.us before the WS emit, but we
      // also maintain a local cache here in case an unresolved @lid ever slips
      // through (e.g. on the very first message before the LID map is built).
      const originalFrom = msg.from || '';
      let incomingChatId = (msg.chatId || msg.from) || '';

      // If backend resolved the LID, cache the mapping for future messages
      if (originalFrom.endsWith('@lid') && incomingChatId && !incomingChatId.endsWith('@lid')) {
        lidToJidMapRef.current.set(originalFrom, incomingChatId);
        console.log('[ChatViewer] 📌 Cached LID mapping:', originalFrom, '→', incomingChatId);
      }

      // If chatId is still @lid (backend could not resolve), try our local cache
      if (incomingChatId.endsWith('@lid')) {
        const resolved = lidToJidMapRef.current.get(incomingChatId);
        if (resolved) {
          console.log('[ChatViewer] ✅ Client-resolved LID:', incomingChatId, '→', resolved);
          incomingChatId = resolved;
        } else {
          console.warn('[ChatViewer] ⚠️ Unresolved @lid — message may not appear in chat:', incomingChatId);
        }
      }
      // ────────────────────────────────────────────────────────────────────────

      // direction may come from backend payload or fall back to fromMe flag
      const direction: 'incoming' | 'outgoing' =
        msg.direction ??
        (msg.fromMe ? 'outgoing' : 'incoming');

      const newMsg: Message = {
        id: msg.id,
        sessionId: event.sessionId,
        waMessageId: msg.id,
        chatId: incomingChatId,
        from: originalFrom,
        to: msg.to || '',
        body: msg.body || '',
        type: msg.type || 'text',
        direction,
        timestamp: msg.timestamp,
        status: 'sent',
        metadata: msg.metadata,
        createdAt: new Date((msg.timestamp || Date.now() / 1000) * 1000).toISOString(),
      };

      // Add to message list only if this chat is currently open
      setMessages(prev => {
        // Dedup: skip if same WA message ID already in the list
        const waId = newMsg.waMessageId || '';
        if (waId && prev.some(m => m.waMessageId === waId)) {
          console.log('[ChatViewer] Dedup — message already in list:', waId);
          return prev;
        }

        if (currentChat && incomingChatId === currentChat.id) {
          console.log('[ChatViewer] ✅ Appending', direction, 'message to chat thread');
          return [...prev, newMsg];
        }

        console.log('[ChatViewer] Message not for active chat:', incomingChatId, '!= currentChat:', currentChat?.id);
        return prev;
      });

      // Update sidebar last-message snippet for contacts (use resolved chatId)
      if (!msg.fromMe) {
        setContacts(prev => prev.map(c =>
          c.id === incomingChatId ? { ...c, lastMessage: newMsg.body } : c
        ));
      }
    },
  }, selectedSessionId);

  // Send message handler
  const handleSendMessage = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!replyText.trim() || !activeChat || !selectedSessionId || sendingMessage) return;

    const currentText = replyText;
    setReplyText('');
    setSendingMessage(true);

    // Optimistic message: append to END (newest at bottom)
    const optimisticId = `temp-${Date.now()}`;
    const tempMsg: Message = {
      id: optimisticId,
      sessionId: selectedSessionId,
      chatId: activeChat.id,
      from: 'me',
      to: activeChat.id,
      body: currentText,
      type: 'text',
      direction: 'outgoing',
      status: 'pending',
      createdAt: new Date().toISOString(),
      timestamp: Math.floor(Date.now() / 1000)
    };

    setMessages(prev => [...prev, tempMsg]);
    scrollToBottom();

    try {
      const response = await messageApi.sendText(selectedSessionId, activeChat.id, currentText);
      // Replace optimistic message with server-confirmed details
      setMessages(prev =>
        prev.map(m => m.id === optimisticId ? {
          ...m,
          id: response.messageId,
          waMessageId: response.messageId,
          status: 'sent',
          timestamp: response.timestamp
        } : m)
      );
      scrollToBottom();
    } catch (err) {
      console.error('Failed to send message:', err);
      setMessages(prev =>
        prev.map(m => m.id === optimisticId ? { ...m, status: 'failed' } : m)
      );
    } finally {
      setSendingMessage(false);
    }
  };

  // Compile list of chats combining contacts & groups
  const allChats: CombinedChat[] = [
    ...contacts.map(c => ({
      id: c.id,
      name: c.name || c.pushName || c.number || c.id.split('@')[0],
      type: 'personal' as const,
      number: c.number
    })),
    ...groups.map(g => ({
      id: g.id,
      name: g.name || g.id.split('@')[0],
      type: 'group' as const
    }))
  ];

  // Apply search query filter
  const filteredChats = allChats.filter(chat => {
    const search = searchQuery.toLowerCase();
    return (
      chat.name.toLowerCase().includes(search) ||
      chat.id.toLowerCase().includes(search) ||
      (chat.number && chat.number.includes(search))
    );
  });

  // Helpers to render message content nicely based on type
  const renderMessageContent = (msg: Message) => {
    switch (msg.type) {
      case 'image': {
        const media = msg.metadata?.media as MessageMedia | undefined;
        const src = media?.url || (media?.data ? `data:${media.mimetype};base64,${media.data}` : null);
        return (
          <div className="media-message">
            {src ? (
              <img src={src} alt={media?.filename || 'Image'} className="chat-media-image" />
            ) : (
              <div className="media-placeholder">
                <ImageIcon size={20} />
                <span>{t('chatViewer.mediaType.image', 'Image')}</span>
              </div>
            )}
            {msg.body && <div className="media-caption">{msg.body}</div>}
          </div>
        );
      }
      case 'video': {
        const media = msg.metadata?.media as MessageMedia | undefined;
        const src = media?.url || (media?.data ? `data:${media.mimetype};base64,${media.data}` : null);
        return (
          <div className="media-message">
            {src ? (
              <video src={src} controls className="chat-media-video" />
            ) : (
              <div className="media-placeholder">
                <Video size={20} />
                <span>{t('chatViewer.mediaType.video', 'Video')}</span>
              </div>
            )}
            {msg.body && <div className="media-caption">{msg.body}</div>}
          </div>
        );
      }
      case 'audio':
      case 'voice': {
        const media = msg.metadata?.media as MessageMedia | undefined;
        const src = media?.url || (media?.data ? `data:${media.mimetype};base64,${media.data}` : null);
        return (
          <div className="media-message audio">
            {src ? (
              <audio src={src} controls className="chat-media-audio" />
            ) : (
              <>
                <Mic size={18} />
                <span>{t('chatViewer.mediaType.audio', 'Voice message')}</span>
              </>
            )}
          </div>
        );
      }
      case 'document': {
        const media = msg.metadata?.media as MessageMedia | undefined;
        const src = media?.url || (media?.data ? `data:${media.mimetype};base64,${media.data}` : null);
        const fileName = media?.filename || msg.body || t('chatViewer.mediaType.document', 'Document');
        return (
          <div className="media-message file">
            <FileText size={18} />
            {src ? (
              <a href={src} download={fileName} className="file-name download-link">
                {fileName}
              </a>
            ) : (
              <span className="file-name">{fileName}</span>
            )}
          </div>
        );
      }
      case 'location': {
        const location = msg.metadata?.location as MessageLocation | undefined;
        if (location?.latitude && location?.longitude) {
          const mapUrl = `https://www.google.com/maps/search/?api=1&query=${location.latitude},${location.longitude}`;
          return (
            <div className="media-message location">
              <MapPin size={18} />
              <a href={mapUrl} target="_blank" rel="noopener noreferrer" className="location-link">
                {location.description || location.address || t('chatViewer.mediaType.viewLocation', 'View Location')}
              </a>
            </div>
          );
        }
        return (
          <div className="media-message location">
            <MapPin size={18} />
            <span>{msg.body || t('chatViewer.mediaType.location', 'Location Shared')}</span>
          </div>
        );
      }
      case 'contact': {
        const contact = msg.metadata?.contact as MessageContact | undefined;
        if (contact?.name || contact?.number) {
          return (
            <div className="media-message contact-card" style={{ display: 'flex', alignItems: 'center' }}>
              <ContactIcon size={18} />
              <div className="contact-details">
                <span className="contact-name">{contact.name || 'Unknown'}</span>
                <span className="contact-number">{contact.number}</span>
              </div>
            </div>
          );
        }
        return (
          <div className="media-message contact-card">
            <ContactIcon size={18} />
            <span>{msg.body || t('chatViewer.mediaType.contactCard', 'Contact Card')}</span>
          </div>
        );
      }
      default:
        // Plain text
        return <p className="text-body">{msg.body}</p>;
    }
  };

  // Helper to format timestamps
  const formatTime = (timestamp?: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp * 1000);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  // Render checkmark ticks based on message status
  const renderMessageStatus = (status: Message['status']) => {
    switch (status) {
      case 'pending':
        return <Clock size={12} className="status-icon pending" />;
      case 'sent':
        return <Check size={12} className="status-icon sent" />;
      case 'delivered':
        return <CheckCheck size={12} className="status-icon delivered" />;
      case 'read':
        return <CheckCheck size={12} className="status-icon read" />;
      case 'failed':
        return <AlertCircle size={12} className="status-icon failed" />;
      default:
        return null;
    }
  };

  return (
    <div className="chat-viewer-page">
      <PageHeader
        title={t('chatViewer.title', 'Chats & History')}
        subtitle={t('chatViewer.subtitle', 'View conversations and reply in real-time')}
      />

      {/* Top Session Bar */}
      <div className="session-selection-bar">
        <label>{t('chatViewer.sessionLabel', 'Select Session:')}</label>
        <select
          value={selectedSessionId}
          onChange={e => setSelectedSessionId(e.target.value)}
          disabled={loadingSessions}
        >
          {loadingSessions && <option value="">{t('chatViewer.loadingSessions', 'Loading sessions...')}</option>}
          {sessions.length === 0 && !loadingSessions && <option value="">{t('chatViewer.noSessions', 'No sessions available')}</option>}
          {sessions.map(s => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.status.toUpperCase()})
            </option>
          ))}
        </select>
        {currentSession && (
          <span className={`session-status-badge ${currentSession.status}`}>
            {currentSession.status === 'ready' ? t('chatViewer.statusConnected', 'Connected') : t('chatViewer.statusDisconnected', 'Offline')}
          </span>
        )}
      </div>

      {!isSessionReady ? (
        <div className="session-offline-state">
          <MessageSquare size={48} className="muted-icon" />
          <h3>{t('chatViewer.sessionNotReadyTitle', 'Session Offline')}</h3>
          <p>{t('chatViewer.sessionNotReadyDesc', 'The selected session is not active. Please start the session on the Sessions page first.')}</p>
        </div>
      ) : (
        <div className="chat-interface-container">
          
          {/* Left panel: searchable list of chats */}
          <div className="chats-sidebar">
            <div className="sidebar-search">
              <Search size={18} />
              <input
                type="text"
                placeholder={t('chatViewer.searchPlaceholder', 'Search chats...')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            <div className="chats-list-container">
              {loadingChats ? (
                <div className="sidebar-loading">
                  <Loader2 className="animate-spin" size={24} />
                  <span>{t('chatViewer.loadingChats', 'Loading chats...')}</span>
                </div>
              ) : filteredChats.length === 0 ? (
                <div className="sidebar-empty">
                  <span>{t('chatViewer.noChatsFound', 'No chats found')}</span>
                </div>
              ) : (
                filteredChats.map((chat, index) => {
                  const isActive = activeChat?.id === chat.id;
                  return (
                    <button
                      key={`${chat.id}-${index}`}
                      className={`chat-item-btn ${isActive ? 'active' : ''}`}
                      onClick={() => setActiveChat(chat)}
                    >
                      <div className={`chat-icon-avatar ${chat.type}`}>
                        {chat.type === 'group' ? <Users size={18} /> : <User size={18} />}
                      </div>
                      <div className="chat-item-info">
                        <span className="chat-item-name">{chat.name}</span>
                        <span className="chat-item-jid">{chat.id}</span>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Right panel: message thread */}
          <div className="message-thread-container">
            {activeChat ? (
              <>
                {/* Chat header */}
                <div className="thread-header">
                  <div className={`chat-icon-avatar ${activeChat.type}`}>
                    {activeChat.type === 'group' ? <Users size={20} /> : <User size={20} />}
                  </div>
                  <div className="thread-header-info">
                    <h3>{activeChat.name}</h3>
                    <span>{activeChat.id}</span>
                  </div>
                </div>

                {/* Message list area */}
                <div 
                  className="thread-messages-body"
                  ref={messagesContainerRef}
                  onScroll={handleMessagesScroll}
                >
                  {loadingMessages ? (
                    <div className="messages-loading">
                      <Loader2 className="animate-spin" size={32} />
                    </div>
                  ) : messages.length === 0 ? (
                    <div className="messages-empty">
                      <MessageSquare size={36} />
                      <p>{t('chatViewer.noHistory', 'No message logs found for this chat.')}</p>
                    </div>
                  ) : (
                    <div className="messages-flow">
                      {/* Messages are stored ASC (oldest first). Newest is last → appears at bottom. */}
                      {/* Deduplicate by waMessageId, fallback to id, to prevent duplicate bubbles */}
                      {Array.from(
                        new Map(messages.map(m => [m.waMessageId || m.id, m])).values()
                      ).map((msg, msgIndex) => {
                        const isOutgoing = msg.direction === 'outgoing';
                        return (
                          <div key={`${msg.waMessageId || msg.id}-${msgIndex}`} className={`message-bubble-wrapper ${isOutgoing ? 'outgoing' : 'incoming'}`}>
                            <div className="message-bubble">
                              {/* Show sender name inside group chats for incoming messages */}
                              {!isOutgoing && activeChat.type === 'group' && (
                                <span className="bubble-sender">{msg.from.split('@')[0]}</span>
                              )}

                              {renderMessageContent(msg)}

                              <div className="bubble-meta">
                                <span className="bubble-time">{formatTime(msg.timestamp)}</span>
                                {isOutgoing && renderMessageStatus(msg.status)}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                      {/* Sentinel element — scrollIntoView targets this to jump to bottom */}
                      <div ref={messagesEndRef} />
                    </div>
                  )}
                </div>

                {/* Floating scroll to bottom button */}
                {showScrollBottom && (
                  <button 
                    className="scroll-bottom-btn" 
                    onClick={() => scrollToBottom()}
                    title={t('chatViewer.scrollToBottom', 'Scroll to bottom')}
                  >
                    <ArrowDown size={18} />
                  </button>
                )}

                {/* Reply section */}
                <form className="thread-reply-bar" onSubmit={handleSendMessage}>
                  <button type="button" className="btn-icon emoji-picker-stub" title={t('chatViewer.addEmoji', 'Add Emoji')}>
                    <Smile size={20} />
                  </button>
                  <input
                    type="text"
                    value={replyText}
                    onChange={e => setReplyText(e.target.value)}
                    placeholder={
                      canWrite 
                        ? t('chatViewer.replyPlaceholder', 'Type a reply...') 
                        : t('chatViewer.viewOnlyPlaceholder', 'You are in view-only mode')
                    }
                    disabled={!canWrite || sendingMessage}
                  />
                  <button
                    type="submit"
                    className="send-message-btn"
                    disabled={!canWrite || !replyText.trim() || sendingMessage}
                    title={t('chatViewer.sendReply', 'Send message')}
                  >
                    {sendingMessage ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                  </button>
                </form>
              </>
            ) : (
              <div className="thread-empty-state">
                <MessageSquare size={64} className="muted-icon animate-pulse" />
                <h3>{t('chatViewer.noChatSelectedTitle', 'Your Conversations')}</h3>
                <p>{t('chatViewer.noChatSelectedDesc', 'Select a contact or group chat from the sidebar list to inspect historical message logs and reply.')}</p>
              </div>
            )}
          </div>

        </div>
      )}
    </div>
  );
}
