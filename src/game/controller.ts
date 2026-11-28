import { createCpuBrain, updateCpuInput, CpuBrainState } from './ai';
import { RetroAudioEngine } from './audio';
import { CHARACTERS, CHARACTER_ORDER } from './characters';
import {
  createEmptyInput,
  createMatchState,
  receiveNetHit,
  receiveNetHpSync,
  receiveNetProjectile,
  receiveNetRoundSync,
  SoundCue,
  stepMatch,
  stepOnlineMatch,
} from './combat';
import {
  applyRemotePacketToTarget,
  createRemoteTarget,
  NetStatePacket,
  PeerConnectionStatus,
  PeerSessionManager,
  RemoteInterpTarget,
} from './net';
import { PublicRoomInfo } from './rooms';
import {
  createReplayPlayback,
  createReplayRecorder,
  cycleReplaySpeed,
  getReplayProgress,
  MatchReplayRecording,
  recordReplayFrame,
  ReplayPlaybackState,
  restartReplayPlayback,
  stepReplayPlayback,
  toggleReplayPause,
} from './replay';
import { scheduleAfterSoftwareDraw, ThreeMainRenderer, ThreePreviewRenderer } from './threeScene';
import { STAGE_ORDER, STAGES } from './stages';
import {
  buildHudOvalFrameSvg,
  getHudFacePortraitSpec,
  readFaceMaskSetting,
  writeFaceMaskSetting,
} from './settings';
import { GAME_CSS } from './styles';
import {
  ACCOUNT_DELETE_WARNING_TEXT,
  ADMIN_EMAIL,
  AdminCharDraftMap,
  autoFitOvalFaceDataUrl,
  canDeleteOnlineRoom,
  clampCropRotationDeg,
  computeCoverFitScale,
  computeLeaderboardWinRate,
  computeUserMatchStats,
  createAdminCharDraftMap,
  createOnlineMatchId,
  CropTransform,
  CustomCharactersMap,
  estimateDataUrlBytes,
  exportOvalCroppedFaceDataUrl,
  filterAdminUsers,
  formatAdminTimestamp,
  formatCropTiltLabel,
  formatMatchDuration,
  formatRelativeRoomTime,
  getCustomFaceOverride,
  getEffectiveCharacterFaceSrc,
  getEffectiveCharacterName,
  isValidFaceDataUrl,
  MAX_CHARACTER_NAME_LEN,
  MAX_CROP_ROTATION_DEG,
  MAX_FACE_DATA_URL_BYTES,
  MAX_USER_DISPLAY_NAME_LEN,
  MIN_CROP_ROTATION_DEG,
  MIN_USER_DISPLAY_NAME_LEN,
  OnlineLeaderboardEntry,
  OnlineMatchHistoryRecord,
  renderCropCanvasPreview,
  RoomChatMessage,
  RoomFighterProfile,
  sanitizeCharacterName,
  sanitizeChatMessageText,
  sanitizeUserDisplayName,
  validateAccountDeletePassword,
} from './customization';
import {
  AdminUserRecord,
  adminUpdateUserAccount,
  AuthSessionState,
  deleteOnlineRoomInDb,
  deleteOwnAccountAndHistory,
  loginWithEmail,
  logoutAccount,
  mapFirebaseAuthError,
  recordOnlineLeaderboardMatchResult,
  registerWithEmail,
  resetCustomCharacterInDb,
  saveCustomCharacterToDb,
  saveUserOnlineMatchHistory,
  sendPasswordReset,
  sendRoomMessage,
  subscribeAllUsersForAdmin,
  subscribeAuthSession,
  subscribeOnlineLeaderboard,
  subscribeRoomMessages,
  subscribeUserOnlineMatchHistory,
  updateUserDisplayName,
} from './firebaseClient';
import {
  CharacterId,
  CpuDifficulty,
  GameMode,
  GameScreen,
  InputSnapshot,
  MatchState,
  OnlineRole,
  StageId,
} from './types';

export interface StickFighterOptions {
  enableOfflineDownload?: boolean;
  offlineHref?: string;
}

export class StickFighterController {
  private root: HTMLElement;
  private options: StickFighterOptions;
  private audio = new RetroAudioEngine();
  private screen: GameScreen = 'title';
  private mode: GameMode = 'cpu';
  private difficulty: CpuDifficulty = 'normal';
  private selectedP1: CharacterId = 'adnan';
  private selectedP2: CharacterId = 'tika';
  private selectedStage: StageId = 'living_room';
  private showTouchControls: boolean;
  private userToggledTouch = false;
  private faceMaskEnabled = false;
  private showSettingsModal = false;

  private matchState: MatchState | null = null;
  private cpuBrain: CpuBrainState = createCpuBrain();
  private rafId: number | null = null;
  private loopTimerId: number | null = null;
  private isDestroyed = false;
  private lastTs = 0;
  private elapsedTitle = 0;
  private matchEndOverlayDelay = 0;

  // Input state
  private keysHeld = new Set<string>();
  private queuedPresses = { punch: false, kick: false, sp: false, super: false };
  private touchHeld = { punch: false, kick: false, sp: false, block: false, super: false };
  private joyVec = { x: 0, y: 0 };
  private joyPointerId: number | null = null;

  // DOM & Three.js Renderer refs
  private shellEl!: HTMLDivElement;
  private stageEl!: HTMLDivElement;
  private portraitDeckEl!: HTMLDivElement;
  private mainRenderer!: ThreeMainRenderer;
  private previewRenderer: ThreePreviewRenderer | null = null;
  private uiLayerEl!: HTMLDivElement;
  private fadeCurtainEl!: HTMLDivElement;
  private lastPortraitLayout = false;

  // Online 1v1 multiplayer state
  private peerSession: PeerSessionManager;
  private onlineRole: OnlineRole = 'host';
  private onlineRoomCode = '';
  private onlineRoomName = '';
  private onlineRoomNameInput = '';
  private onlineRooms: PublicRoomInfo[] = [];
  private onlineStatus: PeerConnectionStatus = 'idle';
  private onlineStatusDetail = 'Pilih Buat Room atau pilih room aktif di daftar.';
  private onlinePingMs = 0;
  private onlineGuestReady = false;
  private onlineRematchPending = false;
  private disconnectedModalOpen = false;
  private remoteTarget: RemoteInterpTarget = createRemoteTarget();
  private netSeq = 0;
  private netSendAccum = 0;

  // PWA & Fullscreen state
  private deferredInstallPrompt: {
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
  } | null = null;
  private isStandaloneInstalled = false;
  private isIOS = false;
  private showIOSInstallGuide = false;
  private fullscreenBtnEl: HTMLButtonElement | null = null;

  // Live HUD refs (mutated directly at 60Hz without rebuilding DOM!)
  private p1HpFillEl: HTMLDivElement | null = null;
  private p1HpTrailEl: HTMLDivElement | null = null;
  private p2HpFillEl: HTMLDivElement | null = null;
  private p2HpTrailEl: HTMLDivElement | null = null;
  private p1GuardFillEl: HTMLDivElement | null = null;
  private p2GuardFillEl: HTMLDivElement | null = null;
  private p1FsmTagEl: HTMLDivElement | null = null;
  private p2FsmTagEl: HTMLDivElement | null = null;
  private timerNumEl: HTMLDivElement | null = null;
  private roundTagEl: HTMLDivElement | null = null;
  private pingTagEl: HTMLDivElement | null = null;
  private bannerWrapEl: HTMLDivElement | null = null;
  private superFillEl: HTMLDivElement | null = null;
  private superLabelEl: HTMLDivElement | null = null;
  private superTouchBtnEl: HTMLButtonElement | null = null;
  private comboEl: HTMLDivElement | null = null;
  private p1PipsEl: HTMLDivElement | null = null;
  private p2PipsEl: HTMLDivElement | null = null;
  private lastBannerSignature = '';
  private lastRoundsSignature = '';

  // Replay recording & playback state
  private replayRecorder: MatchReplayRecording | null = null;
  private replayPlayback: ReplayPlaybackState | null = null;
  private replayReturnScreen: GameScreen = 'gameover';
  private replaySavedMatchState: MatchState | null = null;
  private replayBadgeEl: HTMLDivElement | null = null;
  private replayProgressFillEl: HTMLDivElement | null = null;
  private replayTimeEl: HTMLDivElement | null = null;
  private replayPlayPauseBtnEl: HTMLButtonElement | null = null;
  private replaySpeedBtnEl: HTMLButtonElement | null = null;

  // Auth, Custom Characters, Admin, About & Live Chat state
  private authSession: AuthSessionState | null = null;
  private authUnsub: (() => void) | null = null;
  private showAuthModal = false;
  private authTab: 'login' | 'register' | 'reset' = 'login';
  private authEmailInput = '';
  private authPassInput = '';
  private authPassConfirmInput = '';
  private authBusy = false;
  private authAlert: { type: 'error' | 'success'; text: string } | null = null;
  private blockedAlertEmail: string | null = null;

  private showEditCharsModal = false;
  private editCharSelected: CharacterId = 'adnan';
  private editCharNameInput = '';
  private editCharFacePreview: string | null = null;
  private editCharBusy = false;
  private editCharAlert: { type: 'error' | 'success'; text: string } | null = null;
  private cropImg: HTMLImageElement | null = null;
  private cropTransform: CropTransform = { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 };
  private cropBaseScale = 1;
  private cropZoomFactor = 1;

  private showAdminModal = false;
  private adminTab: 'users' | 'rooms' = 'users';
  private adminUsers: AdminUserRecord[] = [];
  private adminUnsub: (() => void) | null = null;
  private adminAlert: { type: 'error' | 'success'; text: string } | null = null;
  private adminSearchQuery = '';
  private adminRoomSearchQuery = '';
  private adminSelectedUserUid: string | null = null;
  private adminDraftBlocked = false;
  private adminDraftChars: AdminCharDraftMap | null = null;
  private adminDetailSaving = false;

  private pendingDeleteRoom: PublicRoomInfo | null = null;
  private roomDeleteBusy = false;
  private roomDeleteError: string | null = null;

  private showAboutModal = false;

  private showUserProfileModal = false;
  private userProfileTab: 'profile' | 'history' = 'profile';
  private userDisplayNameDraft = '';
  private userProfileBusy = false;
  private userProfileAlert: { type: 'error' | 'success'; text: string } | null = null;
  private userMatchHistory: OnlineMatchHistoryRecord[] = [];
  private userMatchHistoryUid = '';
  private userMatchHistoryUnsub: (() => void) | null = null;
  private showDeleteAccountConfirm = false;
  private deleteAccountPasswordInput = '';
  private deleteAccountBusy = false;
  private deleteAccountError: string | null = null;

  private onlineLobbyTab: 'rooms' | 'leaderboard' = 'rooms';
  private onlineLeaderboard: OnlineLeaderboardEntry[] = [];
  private onlineLeaderboardUsingFallback = false;
  private onlineLeaderboardUnsub: (() => void) | null = null;
  private currentOnlineMatchId = '';
  private currentOnlineMatchStartedAt = 0;
  private recordedOnlineMatchIds = new Set<string>();
  private remotePeerIdentity: { uid: string | null; userName: string; isGuest: boolean } = {
    uid: null,
    userName: 'Guest',
    isGuest: true,
  };

  private remoteCustomName: Partial<Record<CharacterId, string>> = {};
  private remoteCustomFace: Partial<Record<CharacterId, string | null>> = {};

  private chatMessages: RoomChatMessage[] = [];
  private chatUnsub: (() => void) | null = null;
  private chatOpen = false;
  private chatUnreadCount = 0;
  private chatLatestPreview: string | null = null;
  private chatInputDraft = '';
  private chatLastSeenMsgId = '';
  private chatDockEl: HTMLDivElement | null = null;

  constructor(root: HTMLElement, options: StickFighterOptions = {}) {
    this.root = root;
    this.options = options;
    const isPortrait = typeof window !== 'undefined' && window.innerHeight > window.innerWidth;
    this.lastPortraitLayout = isPortrait;
    const coarse =
      typeof window !== 'undefined' &&
      (isPortrait || window.matchMedia?.('(pointer: coarse)').matches || 'ontouchstart' in window || window.innerWidth <= 1024);
    this.showTouchControls = Boolean(coarse);

    if (typeof window !== 'undefined') {
      this.isStandaloneInstalled = Boolean(
        window.matchMedia?.('(display-mode: standalone)').matches ||
          window.matchMedia?.('(display-mode: fullscreen)').matches ||
          (window.navigator as unknown as { standalone?: boolean }).standalone === true
      );
      this.isIOS = /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
      const preCaptured = (window as unknown as { __sfDeferredPrompt?: unknown }).__sfDeferredPrompt;
      if (preCaptured && typeof (preCaptured as { prompt?: unknown }).prompt === 'function') {
        this.deferredInstallPrompt = preCaptured as typeof this.deferredInstallPrompt;
      }
      this.faceMaskEnabled = readFaceMaskSetting(window.localStorage);
    }

    this.peerSession = new PeerSessionManager({
      onStatusChange: (status, detail, roomCode, roomName) => {
        this.onlineStatus = status;
        this.onlineStatusDetail = detail;
        this.onlineRoomCode = roomCode;
        this.onlineRoomName = roomName;
        this.onlineRole = this.peerSession.getRole();

        if (status === 'connected') {
          this.onlineGuestReady = false;
          this.onlineRematchPending = false;
          this.disconnectedModalOpen = false;
          this.onlinePingMs = 0;
          this.selectedP1 = 'adnan';
          this.selectedP2 = 'tika';
          this.selectedStage = 'living_room';
          this.remoteCustomName = {};
          this.remoteCustomFace = {};
          this.remotePeerIdentity = { uid: null, userName: 'Guest', isGuest: true };
          this.currentOnlineMatchId = '';
          this.currentOnlineMatchStartedAt = 0;
          this.startRoomChatSubscription(roomCode);
          this.syncRendererCustomFaces();
          if (this.screen === 'online_lobby') {
            this.audio.playUiClick(true);
            this.setScreen('char_stage_select');
            const myChar = this.onlineRole === 'host' ? this.selectedP1 : this.selectedP2;
            const myProf = this.buildLocalRoomProfile(myChar);
            this.peerSession.syncLocalRoomProfile(myProf);
            this.peerSession.sendReliable({
              t: 'lobby_pick',
              charId: myChar,
              ready: this.onlineRole === 'host',
              stageId: this.onlineRole === 'host' ? this.selectedStage : undefined,
              customName: myProf.name,
              customFace: myProf.faceBase64,
              uid: myProf.uid,
              userName: myProf.userName,
              isGuest: myProf.isGuest,
            });
          }
          return;
        }

        if (this.screen === 'online_lobby') {
          if (status === 'waiting' || status === 'idle') {
            this.renderUI();
            return;
          }
          const statusTxt = document.getElementById('sf-online-status-text');
          const statusConn = document.getElementById('sf-online-server-badge');
          if (statusTxt) {
            statusTxt.textContent = `STATUS: ${detail}`;
          }
          if (statusConn) {
            statusConn.textContent = this.peerSession.isSocketOpen()
              ? 'SERVER TERHUBUNG'
              : this.peerSession.isServerAvailable()
                ? 'MENGHUBUNGKAN...'
                : 'MODE OFFLINE';
          }
          this.refreshActiveRoomsListDom();
        }
      },
      onRoomsUpdate: (rooms) => {
        this.onlineRooms = rooms;
        if (this.screen === 'online_lobby') {
          this.refreshActiveRoomsListDom();
          this.refreshOnlineLobbyTabCounts();
          const statusConn = document.getElementById('sf-online-server-badge');
          if (statusConn) {
            statusConn.textContent = this.peerSession.isSocketOpen()
              ? `SERVER TERHUBUNG · ${rooms.length} ROOM`
              : 'MENGHUBUNGKAN...';
          }
        }
        if (this.showAdminModal && this.adminTab === 'rooms' && !this.adminSelectedUserUid) {
          this.updateAdminRoomListDom();
          const tabBtn = document.getElementById('sf-admin-tab-rooms');
          if (tabBtn) tabBtn.textContent = `KELOLA ROOM (${rooms.length})`;
        }
      },
      onReliableMessage: (msg) => {
        if (msg.t === 'hello') {
          if (msg.profile) {
            this.remotePeerIdentity = {
              uid: msg.profile.uid || null,
              userName: msg.profile.userName || 'Guest',
              isGuest: msg.profile.isGuest !== false && !msg.profile.uid,
            };
          }
          if (this.screen === 'char_stage_select') {
            const myChar = this.onlineRole === 'host' ? this.selectedP1 : this.selectedP2;
            const myProf = this.buildLocalRoomProfile(myChar);
            this.peerSession.sendReliable({
              t: 'lobby_pick',
              charId: myChar,
              ready: this.onlineRole === 'host' ? true : this.onlineGuestReady,
              stageId: this.onlineRole === 'host' ? this.selectedStage : undefined,
              customName: myProf.name,
              customFace: myProf.faceBase64,
              uid: myProf.uid,
              userName: myProf.userName,
              isGuest: myProf.isGuest,
            });
          }
        } else if (msg.t === 'lobby_pick') {
          if (typeof msg.customName === 'string' && msg.customName.trim()) {
            this.remoteCustomName[msg.charId] = sanitizeCharacterName(msg.customName);
          }
          if (msg.customFace !== undefined) {
            this.remoteCustomFace[msg.charId] = isValidFaceDataUrl(msg.customFace)
              ? msg.customFace
              : null;
          }
          if (typeof msg.userName === 'string' && msg.userName.trim()) {
            this.remotePeerIdentity = {
              uid: msg.uid || null,
              userName: msg.userName.trim(),
              isGuest: msg.isGuest === true || !msg.uid,
            };
          }
          if (this.onlineRole === 'host') {
            this.selectedP2 = msg.charId;
            this.onlineGuestReady = msg.ready;
          } else {
            this.selectedP1 = msg.charId;
            if (msg.stageId) this.selectedStage = msg.stageId;
          }
          this.syncRendererCustomFaces();
          if (this.screen === 'char_stage_select') {
            this.renderUI();
          }
        } else if (msg.t === 'match_start') {
          this.selectedP1 = msg.p1Char;
          this.selectedP2 = msg.p2Char;
          this.selectedStage = msg.stageId;
          this.currentOnlineMatchStartedAt = msg.startedAt || Date.now();
          this.currentOnlineMatchId =
            msg.matchId ||
            createOnlineMatchId(this.onlineRoomCode || 'online', this.currentOnlineMatchStartedAt);
          if (this.onlineRole === 'guest') {
            if (msg.p1Name) this.remoteCustomName[msg.p1Char] = sanitizeCharacterName(msg.p1Name);
            if (msg.p1Face !== undefined) {
              this.remoteCustomFace[msg.p1Char] = isValidFaceDataUrl(msg.p1Face)
                ? msg.p1Face
                : null;
            }
            this.remotePeerIdentity = {
              uid: msg.p1Uid || null,
              userName: msg.p1UserName || 'Guest',
              isGuest: msg.p1IsGuest === true || !msg.p1Uid,
            };
          } else {
            if (msg.p2Name) this.remoteCustomName[msg.p2Char] = sanitizeCharacterName(msg.p2Name);
            if (msg.p2Face !== undefined) {
              this.remoteCustomFace[msg.p2Char] = isValidFaceDataUrl(msg.p2Face)
                ? msg.p2Face
                : null;
            }
            this.remotePeerIdentity = {
              uid: msg.p2Uid || null,
              userName: msg.p2UserName || 'Guest',
              isGuest: msg.p2IsGuest === true || !msg.p2Uid,
            };
          }
          this.syncRendererCustomFaces();
          this.onlineRematchPending = false;
          this.startMatch();
        } else if (msg.t === 'hit') {
          if (this.matchState && this.mode === 'online_1v1') {
            const cues: SoundCue[] = [];
            const reply = receiveNetHit(
              this.matchState,
              this.onlineRole,
              this.collectHoldOnlyInput(),
              msg,
              cues
            );
            for (const c of cues) this.audio.playCue(c);
            this.peerSession.sendReliable(reply);
          }
        } else if (msg.t === 'hp_sync') {
          if (this.matchState && this.mode === 'online_1v1') {
            receiveNetHpSync(this.matchState, this.onlineRole, msg);
          }
        } else if (msg.t === 'proj') {
          if (this.matchState && this.mode === 'online_1v1') {
            receiveNetProjectile(this.matchState, this.onlineRole, msg);
          }
        } else if (msg.t === 'round') {
          if (this.matchState && this.mode === 'online_1v1') {
            if (msg.num > this.matchState.roundNumber) {
              this.remoteTarget = createRemoteTarget();
            }
            const cues: SoundCue[] = [];
            receiveNetRoundSync(this.matchState, msg, cues);
            for (const c of cues) this.audio.playCue(c);
          }
        } else if (msg.t === 'rematch_req') {
          if (this.onlineRole === 'host' && this.screen === 'gameover') {
            if (this.onlineRematchPending) {
              this.sendMatchStartToGuest();
              this.startMatch();
            } else {
              this.onlineRematchPending = true;
              const btn = document.getElementById('sf-online-rematch-btn');
              if (btn) btn.textContent = 'REMATCH (LAWAN SIAP!)';
            }
          }
        }
      },
      onStatePacket: (pkt) => {
        applyRemotePacketToTarget(this.remoteTarget, pkt);
      },
      onPingUpdate: (pingMs) => {
        this.onlinePingMs = pingMs;
        if (this.pingTagEl) {
          this.pingTagEl.textContent = `PING: ${pingMs}ms`;
        }
      },
      onDisconnect: () => {
        if (
          this.mode === 'online_1v1' &&
          (this.screen === 'char_stage_select' ||
            this.screen === 'playing' ||
            this.screen === 'paused' ||
            this.screen === 'gameover')
        ) {
          this.clearAllInputs();
          this.audio.stopBgm();
          this.disconnectedModalOpen = true;
          this.renderUI();
        } else if (this.screen === 'online_lobby') {
          this.onlineStatus = 'disconnected';
          this.onlineStatusDetail = 'LAWAN TERPUTUS';
          this.renderUI();
        }
      },
    });

    this.injectStyles();
    this.mountBaseShell();
    this.bindGlobalListeners();
    this.initAuthSubscription();

    const params = new URLSearchParams(window.location.search);
    const stageParam = params.get('stage') as StageId | null;
    if (stageParam && STAGE_ORDER.includes(stageParam)) {
      this.selectedStage = stageParam;
    }
    if (params.get('autostart') === '1') {
      this.startMatch();
    } else {
      this.setScreen('title');
    }
    this.startLoop();
  }

  private initAuthSubscription(): void {
    try {
      this.authUnsub = subscribeAuthSession(
        (session) => {
          this.authSession = session;
          if (session) {
            if (!this.userProfileBusy) {
              this.userDisplayNameDraft = session.displayName;
            }
            this.startUserMatchHistorySubscription(session.uid);
          } else {
            this.stopUserMatchHistorySubscription();
            this.userMatchHistory = [];
            this.showUserProfileModal = false;
            this.userDisplayNameDraft = '';
          }
          this.syncRendererCustomFaces();
          if (this.screen === 'playing' || this.screen === 'replay') {
            this.syncHudPortraitFrames();
          } else {
            this.renderUI();
          }
        },
        (blockedEmail) => {
          this.authSession = null;
          this.stopUserMatchHistorySubscription();
          this.userMatchHistory = [];
          this.showUserProfileModal = false;
          this.showAuthModal = false;
          this.showEditCharsModal = false;
          this.showAdminModal = false;
          this.stopAdminSubscription();
          this.blockedAlertEmail = blockedEmail || 'Akun ini';
          this.syncRendererCustomFaces();
          this.renderUI();
        }
      );
    } catch (e) {
      console.error('Auth subscription init error:', e);
    }
  }

  private startUserMatchHistorySubscription(uid: string): void {
    if (this.userMatchHistoryUid === uid && this.userMatchHistoryUnsub) return;
    this.stopUserMatchHistorySubscription();
    this.userMatchHistoryUid = uid;
    this.userMatchHistoryUnsub = subscribeUserOnlineMatchHistory(uid, (records) => {
      this.userMatchHistory = records;
      if (this.showUserProfileModal) {
        this.renderUI();
      }
    });
  }

  private stopUserMatchHistorySubscription(): void {
    if (this.userMatchHistoryUnsub) {
      this.userMatchHistoryUnsub();
      this.userMatchHistoryUnsub = null;
    }
    this.userMatchHistoryUid = '';
  }

  private startOnlineLeaderboardSubscription(): void {
    if (this.onlineLeaderboardUnsub) return;
    this.onlineLeaderboardUnsub = subscribeOnlineLeaderboard(
      (entries) => {
        this.onlineLeaderboard = entries;
        if (this.screen === 'online_lobby') {
          this.refreshOnlineLobbyTabCounts();
          if (this.onlineLobbyTab === 'leaderboard') {
            this.refreshLeaderboardListDom();
          }
        }
      },
      ({ usingFallback }) => {
        this.onlineLeaderboardUsingFallback = usingFallback;
        const descEl = document.getElementById('sf-online-leaderboard-desc');
        if (descEl && this.onlineLobbyTab === 'leaderboard') {
          descEl.textContent = usingFallback
            ? 'Peringkat Online 1v1 (sinkronisasi server aplikasi aktif). User login akumulatif; Guest tercatat 1 kali tiap bertanding.'
            : 'Peringkat Online 1v1 (User login akumulatif & sinkron nama otomatis; Guest tercatat 1 kali tiap bertanding).';
        }
      }
    );
  }

  private stopOnlineLeaderboardSubscription(): void {
    if (this.onlineLeaderboardUnsub) {
      this.onlineLeaderboardUnsub();
      this.onlineLeaderboardUnsub = null;
    }
  }

  private getLocalUserIdentity(): { uid: string | null; userName: string; isGuest: boolean } {
    if (this.authSession) {
      return {
        uid: this.authSession.uid,
        userName: this.authSession.displayName,
        isGuest: false,
      };
    }
    return {
      uid: null,
      userName: 'Guest',
      isGuest: true,
    };
  }

  private buildLocalRoomProfile(charId: CharacterId): RoomFighterProfile {
    const custom = this.authSession?.customCharacters || null;
    const identity = this.getLocalUserIdentity();
    return {
      charId,
      name: getEffectiveCharacterName(charId, custom),
      faceBase64: getCustomFaceOverride(charId, custom),
      uid: identity.uid,
      userName: identity.userName,
      isGuest: identity.isGuest,
    };
  }

  private getSlotCharacterName(slot: 1 | 2, charId: CharacterId): string {
    const custom = this.authSession?.customCharacters || null;
    if (this.mode === 'online_1v1') {
      const isLocalSlot =
        (slot === 1 && this.onlineRole === 'host') ||
        (slot === 2 && this.onlineRole === 'guest');
      return isLocalSlot
        ? getEffectiveCharacterName(charId, custom)
        : getEffectiveCharacterName(charId, null, this.remoteCustomName[charId]);
    }
    return getEffectiveCharacterName(charId, custom);
  }

  private getSlotFaceOverride(slot: 1 | 2, charId: CharacterId): string | null {
    const custom = this.authSession?.customCharacters || null;
    if (this.mode === 'online_1v1') {
      const isLocalSlot =
        (slot === 1 && this.onlineRole === 'host') ||
        (slot === 2 && this.onlineRole === 'guest');
      if (isLocalSlot) {
        return getCustomFaceOverride(charId, custom);
      }
      const remote = this.remoteCustomFace[charId];
      return isValidFaceDataUrl(remote) ? remote : null;
    }
    return getCustomFaceOverride(charId, custom);
  }

  private syncRendererCustomFaces(): void {
    const custom = this.authSession?.customCharacters || null;
    this.mainRenderer?.setTitleFaceOverrides({
      adnan: getCustomFaceOverride('adnan', custom),
      tika: getCustomFaceOverride('tika', custom),
    });

    const p1Char = this.matchState?.p1.charId ?? this.selectedP1;
    const p2Char = this.matchState?.p2.charId ?? this.selectedP2;
    this.mainRenderer?.setSlotFaceOverrides({
      1: this.getSlotFaceOverride(1, p1Char),
      2: this.getSlotFaceOverride(2, p2Char),
    });

    if (this.previewRenderer) {
      const isOnline = this.mode === 'online_1v1';
      const isHost = !isOnline || this.onlineRole === 'host';
      const localChar = isHost ? this.selectedP1 : this.selectedP2;
      this.previewRenderer.setCustomFaceUrl(getCustomFaceOverride(localChar, custom));
    }
  }

  private sendMatchStartToGuest(): void {
    const hostProf = this.buildLocalRoomProfile(this.selectedP1);
    const p2Face = this.remoteCustomFace[this.selectedP2] ?? null;
    const p2Name = this.remoteCustomName[this.selectedP2];
    const startedAt = Date.now();
    const matchId = createOnlineMatchId(this.onlineRoomCode || 'online', startedAt);
    this.currentOnlineMatchId = matchId;
    this.currentOnlineMatchStartedAt = startedAt;
    this.peerSession.sendReliable({
      t: 'match_start',
      p1Char: this.selectedP1,
      p2Char: this.selectedP2,
      stageId: this.selectedStage,
      p1Name: hostProf.name,
      p1Face: hostProf.faceBase64,
      p2Name,
      p2Face,
      matchId,
      startedAt,
      p1Uid: hostProf.uid,
      p1UserName: hostProf.userName,
      p1IsGuest: hostProf.isGuest,
      p2Uid: this.remotePeerIdentity.uid,
      p2UserName: this.remotePeerIdentity.userName,
      p2IsGuest: this.remotePeerIdentity.isGuest,
    });
  }

  private recordCompletedOnlineMatchIfNeeded(): void {
    if (!this.matchState) return;
    const m = this.matchState;
    if (m.mode !== 'online_1v1' || m.roundPhase !== 'match_end') return;

    const fallbackStart = this.currentOnlineMatchStartedAt || Date.now();
    const matchId =
      this.currentOnlineMatchId ||
      createOnlineMatchId(this.onlineRoomCode || 'online', fallbackStart);
    if (this.recordedOnlineMatchIds.has(matchId)) return;
    this.recordedOnlineMatchIds.add(matchId);

    const localSlot: 1 | 2 = this.onlineRole === 'guest' ? 2 : 1;
    const oppSlot: 1 | 2 = localSlot === 1 ? 2 : 1;
    const localFighter = localSlot === 1 ? m.p1 : m.p2;
    const oppFighter = localSlot === 1 ? m.p2 : m.p1;
    const won = m.winnerSlot === localSlot;
    const identity = this.getLocalUserIdentity();
    const myCharName = this.getSlotCharacterName(localSlot, localFighter.charId);
    const oppCharName = this.getSlotCharacterName(oppSlot, oppFighter.charId);
    const durationMs = Math.max(
      1000,
      m.matchTimeElapsed > 0
        ? Math.round(m.matchTimeElapsed * 1000)
        : Date.now() - fallbackStart
    );
    const playedAt = Date.now();
    const roomName = (this.onlineRoomName || `Room ${this.onlineRoomCode || 'Online'}`).slice(0, 32);

    if (identity.uid) {
      const historyRecord: OnlineMatchHistoryRecord = {
        matchId,
        roomId: this.onlineRoomCode || '',
        roomName,
        playedAt,
        durationMs,
        result: won ? 'win' : 'loss',
        myName: identity.userName,
        myCharId: localFighter.charId,
        myCharName,
        myRoundsWon: localFighter.roundsWon,
        opponentUid: this.remotePeerIdentity.uid,
        opponentName: this.remotePeerIdentity.userName || 'Guest',
        opponentIsGuest: this.remotePeerIdentity.isGuest,
        opponentCharId: oppFighter.charId,
        opponentCharName: oppCharName,
        opponentRoundsWon: oppFighter.roundsWon,
        stageId: m.stageId,
      };
      saveUserOnlineMatchHistory(identity.uid, historyRecord).catch((err) => {
        console.warn('Warning saving online match history:', err);
      });
    }

    recordOnlineLeaderboardMatchResult({
      matchId,
      localSlot,
      won,
      uid: identity.uid,
      displayName: identity.userName,
      charName: myCharName,
    }).catch((err) => {
      console.warn('Warning recording online leaderboard result:', err);
    });
  }

  private injectStyles(): void {
    if (document.getElementById('stick-fighter-styles')) return;
    const style = document.createElement('style');
    style.id = 'stick-fighter-styles';
    style.textContent = GAME_CSS;
    document.head.appendChild(style);
  }

  private mountBaseShell(): void {
    this.root.innerHTML = '';
    this.shellEl = document.createElement('div');
    this.shellEl.className = 'sf-shell';

    this.stageEl = document.createElement('div');
    this.stageEl.className = 'sf-viewport-stage';
    this.mainRenderer = new ThreeMainRenderer(this.stageEl, this.faceMaskEnabled);

    this.uiLayerEl = document.createElement('div');
    this.uiLayerEl.className = 'sf-ui-layer';
    this.stageEl.appendChild(this.uiLayerEl);

    this.fadeCurtainEl = document.createElement('div');
    this.fadeCurtainEl.className = 'sf-fade-curtain';
    this.stageEl.appendChild(this.fadeCurtainEl);

    // Persistent Top-Right Expand Fullscreen button inside the game stage
    const fsBtn = document.createElement('button');
    fsBtn.className = 'sf-btn sf-fullscreen-btn';
    fsBtn.id = 'sf-btn-fullscreen';
    fsBtn.tabIndex = -1;
    fsBtn.setAttribute('aria-label', 'Layar Penuh');
    fsBtn.title = 'Layar Penuh (Fullscreen)';
    fsBtn.addEventListener('click', (e) => {
      e.currentTarget && (e.currentTarget as HTMLElement).blur();
      this.audio.playUiClick(false);
      this.toggleFullscreen();
    });
    this.fullscreenBtnEl = fsBtn;
    this.updateFullscreenButtonIcon();
    this.stageEl.appendChild(fsBtn);

    // Portrait bottom controller deck (holds virtual joystick & buttons below landscape screen in portrait)
    this.portraitDeckEl = document.createElement('div');
    this.portraitDeckEl.className = 'sf-portrait-deck';

    this.shellEl.appendChild(this.stageEl);
    this.shellEl.appendChild(this.portraitDeckEl);
    this.root.appendChild(this.shellEl);
    this.resizeCanvas();
  }

  private getFullscreenElement(): Element | null {
    const doc = document as unknown as {
      fullscreenElement?: Element | null;
      webkitFullscreenElement?: Element | null;
    };
    return doc.fullscreenElement || doc.webkitFullscreenElement || null;
  }

  private toggleFullscreen(): void {
    const doc = document as unknown as {
      exitFullscreen?: () => Promise<void>;
      webkitExitFullscreen?: () => Promise<void>;
    };
    const el = (this.shellEl || document.documentElement) as unknown as {
      requestFullscreen?: () => Promise<void>;
      webkitRequestFullscreen?: () => Promise<void>;
    };

    if (this.getFullscreenElement()) {
      const p = doc.exitFullscreen ? doc.exitFullscreen() : doc.webkitExitFullscreen?.();
      Promise.resolve(p).catch(() => {});
    } else {
      const p = el.requestFullscreen ? el.requestFullscreen() : el.webkitRequestFullscreen?.();
      Promise.resolve(p)
        .then(() => {
          const orient = screen.orientation as unknown as { lock?: (o: string) => Promise<void> };
          if (orient?.lock) {
            orient.lock('landscape').catch(() => {});
          }
        })
        .catch(() => {});
    }
  }

  private updateFullscreenButtonIcon = (): void => {
    if (!this.fullscreenBtnEl) return;
    const active = Boolean(this.getFullscreenElement());
    this.fullscreenBtnEl.setAttribute('aria-label', active ? 'Keluar Layar Penuh' : 'Layar Penuh');
    this.fullscreenBtnEl.title = active ? 'Keluar Layar Penuh' : 'Layar Penuh (Fullscreen)';
    this.fullscreenBtnEl.innerHTML = active
      ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" aria-hidden="true">
          <polyline points="4 10 10 10 10 4"/>
          <polyline points="20 10 14 10 14 4"/>
          <polyline points="4 14 10 14 10 20"/>
          <polyline points="20 14 14 14 14 20"/>
        </svg>`
      : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="square" aria-hidden="true">
          <polyline points="15 3 21 3 21 9"/>
          <polyline points="9 3 3 3 3 9"/>
          <polyline points="15 21 21 21 21 15"/>
          <polyline points="9 21 3 21 3 15"/>
        </svg>`;
  };

  private isPortraitViewport(): boolean {
    if (typeof window === 'undefined') return false;
    return window.innerHeight > window.innerWidth;
  }

  private resizeCanvas = (): void => {
    const w = this.stageEl.clientWidth || this.shellEl.clientWidth || window.innerWidth;
    const h = this.stageEl.clientHeight || this.shellEl.clientHeight || window.innerHeight;
    this.mainRenderer.resize(w, h);

    const isPortrait = this.isPortraitViewport();
    const orientationChanged = isPortrait !== this.lastPortraitLayout;
    this.lastPortraitLayout = isPortrait;

    if (!this.userToggledTouch) {
      const shouldShow = Boolean(
        isPortrait ||
          window.matchMedia?.('(pointer: coarse)').matches ||
          'ontouchstart' in window ||
          window.innerWidth <= 1024
      );
      if (shouldShow !== this.showTouchControls) {
        this.showTouchControls = shouldShow;
        if (this.screen === 'playing') {
          this.renderUI();
          return;
        }
      }
    }

    if (orientationChanged && (this.screen === 'playing' || this.screen === 'paused' || this.screen === 'gameover' || this.screen === 'replay')) {
      this.renderUI();
    }
  };

  private isTextInputElement(target: EventTarget | null): boolean {
    if (!target || !(target instanceof HTMLElement)) return false;
    const tag = target.tagName;
    if (tag === 'TEXTAREA' || tag === 'SELECT' || target.isContentEditable) return true;
    if (tag === 'INPUT') {
      const type = (target as HTMLInputElement).type;
      return type !== 'checkbox' && type !== 'radio' && type !== 'button' && type !== 'submit';
    }
    return false;
  }

  private hasBlockingModalOpen(): boolean {
    return Boolean(
      this.blockedAlertEmail ||
        this.showAuthModal ||
        this.showUserProfileModal ||
        this.showDeleteAccountConfirm ||
        this.pendingDeleteRoom ||
        this.showEditCharsModal ||
        this.showAdminModal ||
        this.showAboutModal ||
        this.showSettingsModal ||
        this.showIOSInstallGuide ||
        this.disconnectedModalOpen
    );
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const code = e.code;

    if (this.isTextInputElement(e.target)) {
      if (code === 'Escape') {
        (e.target as HTMLElement).blur();
      }
      return;
    }

    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) {
      e.preventDefault();
    }

    if (code === 'Escape') {
      if (this.pendingDeleteRoom) {
        if (!this.roomDeleteBusy) {
          this.pendingDeleteRoom = null;
          this.roomDeleteError = null;
          this.renderUI();
        }
        return;
      }
      if (this.showDeleteAccountConfirm) {
        if (!this.deleteAccountBusy) {
          this.showDeleteAccountConfirm = false;
          this.deleteAccountPasswordInput = '';
          this.deleteAccountError = null;
          this.renderUI();
        }
        return;
      }
      if (this.showAuthModal) {
        this.showAuthModal = false;
        this.renderUI();
        return;
      }
      if (this.showUserProfileModal) {
        this.showUserProfileModal = false;
        this.renderUI();
        return;
      }
      if (this.showEditCharsModal) {
        this.showEditCharsModal = false;
        this.cropImg = null;
        this.renderUI();
        return;
      }
      if (this.showAdminModal) {
        this.closeAdminModal();
        return;
      }
      if (this.showAboutModal) {
        this.showAboutModal = false;
        this.renderUI();
        return;
      }
      if (this.showSettingsModal) {
        this.audio.playUiClick(false);
        this.showSettingsModal = false;
        this.renderUI();
        return;
      }
    }

    if (this.hasBlockingModalOpen()) {
      return;
    }

    if (this.screen === 'title' && (code === 'Enter' || code === 'Space')) {
      this.audio.playUiClick(true);
      this.setScreen('mode_select');
      return;
    }

    if (code === 'KeyM') {
      this.audio.toggleMute();
      if (this.screen !== 'playing' && this.screen !== 'replay') this.renderUI();
      else this.updateUtilityLabels();
      return;
    }

    if (this.screen === 'replay') {
      if (code === 'Escape' || code === 'KeyP') {
        this.exitReplay();
      } else if (code === 'Space') {
        this.toggleReplayPlaybackPause();
      } else if (code === 'KeyR') {
        this.restartReplay();
      } else if (code === 'KeyS') {
        this.cycleReplayPlaybackSpeed();
      }
      return;
    }

    if (this.screen === 'playing' && (code === 'Escape' || code === 'KeyP')) {
      this.pauseGame();
      return;
    }
    if (this.screen === 'paused' && (code === 'Escape' || code === 'KeyP')) {
      this.resumeGame();
      return;
    }

    if (!this.keysHeld.has(code)) {
      this.keysHeld.add(code);
      if (code === 'KeyJ') this.queuedPresses.punch = true;
      if (code === 'KeyK') this.queuedPresses.kick = true;
      if (code === 'KeyL') this.queuedPresses.sp = true;
      if (code === 'KeyI') this.queuedPresses.super = true;
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keysHeld.delete(e.code);
  };

  private clearAllInputs = (): void => {
    this.keysHeld.clear();
    this.queuedPresses = { punch: false, kick: false, sp: false, super: false };
    this.touchHeld = { punch: false, kick: false, sp: false, block: false, super: false };
    this.joyVec = { x: 0, y: 0 };
    this.joyPointerId = null;
  };

  private onPageHide = (): void => {
    if (this.mode === 'online_1v1') {
      this.peerSession.sendBye();
    }
  };

  private onBeforeInstallPrompt = (e: Event): void => {
    e.preventDefault();
    this.deferredInstallPrompt = e as unknown as typeof this.deferredInstallPrompt;
    (window as unknown as { __sfDeferredPrompt?: unknown }).__sfDeferredPrompt = e;
    if (this.screen === 'title') {
      this.renderUI();
    }
  };

  private onAppInstalled = (): void => {
    this.isStandaloneInstalled = true;
    this.deferredInstallPrompt = null;
    this.showIOSInstallGuide = false;
    (window as unknown as { __sfDeferredPrompt?: unknown }).__sfDeferredPrompt = null;
    if (this.screen === 'title') {
      this.renderUI();
    }
  };

  private onVisibilityChange = (): void => {
    if (document.hidden) this.clearAllInputs();
  };

  private bindGlobalListeners(): void {
    window.addEventListener('resize', this.resizeCanvas);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.clearAllInputs);
    window.addEventListener('pagehide', this.onPageHide);
    window.addEventListener('beforeunload', this.onPageHide);
    window.addEventListener('beforeinstallprompt', this.onBeforeInstallPrompt);
    window.addEventListener('appinstalled', this.onAppInstalled);
    document.addEventListener('fullscreenchange', this.updateFullscreenButtonIcon);
    document.addEventListener('webkitfullscreenchange', this.updateFullscreenButtonIcon);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  public destroy(): void {
    this.isDestroyed = true;
    if (this.rafId !== null) cancelAnimationFrame(this.rafId);
    if (this.loopTimerId !== null) clearTimeout(this.loopTimerId);
    if (this.mode === 'online_1v1') this.peerSession.sendBye();
    this.peerSession.cleanup();
    this.stopRoomChatSubscription();
    this.stopAdminSubscription();
    this.stopUserMatchHistorySubscription();
    this.stopOnlineLeaderboardSubscription();
    if (this.authUnsub) {
      this.authUnsub();
      this.authUnsub = null;
    }
    this.audio.stopBgm();
    this.previewRenderer?.dispose();
    this.previewRenderer = null;
    this.mainRenderer.dispose();
    window.removeEventListener('resize', this.resizeCanvas);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.clearAllInputs);
    window.removeEventListener('pagehide', this.onPageHide);
    window.removeEventListener('beforeunload', this.onPageHide);
    window.removeEventListener('beforeinstallprompt', this.onBeforeInstallPrompt);
    window.removeEventListener('appinstalled', this.onAppInstalled);
    document.removeEventListener('fullscreenchange', this.updateFullscreenButtonIcon);
    document.removeEventListener('webkitfullscreenchange', this.updateFullscreenButtonIcon);
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
  }

  private leaveOnlineToMenu(target: GameScreen = 'title'): void {
    this.stopRoomChatSubscription();
    this.stopOnlineLeaderboardSubscription();
    this.peerSession.sendBye();
    this.peerSession.cleanup();
    this.disconnectedModalOpen = false;
    this.onlineStatus = 'idle';
    this.onlineStatusDetail = 'Pilih Buat Room atau pilih room dari daftar.';
    this.onlineRoomCode = '';
    this.onlineRoomName = '';
    this.onlineRooms = [];
    this.onlineGuestReady = false;
    this.onlineRematchPending = false;
    this.currentOnlineMatchId = '';
    this.currentOnlineMatchStartedAt = 0;
    this.remotePeerIdentity = { uid: null, userName: 'Guest', isGuest: true };
    this.remoteCustomName = {};
    this.remoteCustomFace = {};
    this.syncRendererCustomFaces();
    this.setScreen(target);
  }

  private setScreen(next: GameScreen): void {
    this.screen = next;
    if (next !== 'playing') {
      this.matchEndOverlayDelay = 0;
    }
    if (this.fadeCurtainEl) {
      if (next === 'gameover') {
        // Reveal gameover smoothly out of the white post-victory fade-out curtain
        this.fadeCurtainEl.style.transition = 'opacity 0.55s ease-out';
        requestAnimationFrame(() => {
          if (this.screen === 'gameover') {
            this.fadeCurtainEl.style.opacity = '0';
          }
        });
      } else {
        this.fadeCurtainEl.style.transition = 'opacity 0.25s ease-out';
        this.fadeCurtainEl.style.opacity = '0';
      }
    }
    document.body.dataset.screen = next;
    if (next === 'title' || next === 'mode_select' || next === 'online_lobby' || next === 'char_stage_select') {
      document.body.dataset.state = 'title';
    } else if (next === 'playing') {
      document.body.dataset.state = 'playing';
    } else if (next === 'replay') {
      document.body.dataset.state = 'replay';
    } else if (next === 'paused') {
      document.body.dataset.state = 'paused';
    } else if (next === 'gameover') {
      document.body.dataset.state = 'gameover';
    }
    this.renderUI();
    requestAnimationFrame(() => this.resizeCanvas());
  }

  private startMatch(): void {
    this.clearAllInputs();
    this.audio.unlock();
    this.audio.startBgm();
    this.matchEndOverlayDelay = 0;
    this.matchState = createMatchState(
      this.selectedP1,
      this.selectedP2,
      this.selectedStage,
      this.mode,
      this.difficulty
    );
    this.replayPlayback = null;
    this.replaySavedMatchState = null;
    this.replayRecorder =
      this.mode === 'cpu' || this.mode === 'training' ? createReplayRecorder(this.matchState) : null;
    this.cpuBrain = createCpuBrain();
    this.remoteTarget = createRemoteTarget();
    this.netSeq = 0;
    this.netSendAccum = 0;
    this.disconnectedModalOpen = false;
    this.lastBannerSignature = '';
    this.lastRoundsSignature = '';
    this.syncRendererCustomFaces();
    this.setScreen('playing');
    this.mainRenderer.renderMatchScene(this.matchState);
    this.mainRenderer.canvas.focus();
  }

  private startReplay(returnScreen: GameScreen = 'gameover'): void {
    if (!this.replayRecorder || this.replayRecorder.frames.length === 0) return;
    this.clearAllInputs();
    this.audio.unlock();
    this.audio.startBgm();
    this.audio.setSlowMoFactor(1);
    this.replayReturnScreen = returnScreen;
    this.replaySavedMatchState = this.matchState;
    const { playback, matchState } = createReplayPlayback(this.replayRecorder);
    this.replayPlayback = playback;
    this.matchState = matchState;
    this.lastBannerSignature = '';
    this.lastRoundsSignature = '';
    this.setScreen('replay');
    this.mainRenderer.renderMatchScene(this.matchState);
    this.mainRenderer.canvas.focus();
  }

  private exitReplay(): void {
    if (this.screen !== 'replay') return;
    this.clearAllInputs();
    this.audio.setSlowMoFactor(1);
    this.replayPlayback = null;
    if (this.replaySavedMatchState) {
      this.matchState = this.replaySavedMatchState;
    }
    this.replaySavedMatchState = null;
    if (this.replayReturnScreen === 'gameover' || this.replayReturnScreen === 'paused') {
      this.audio.stopBgm();
    }
    this.lastBannerSignature = '';
    this.lastRoundsSignature = '';
    this.setScreen(this.replayReturnScreen);
    if (this.matchState) {
      this.mainRenderer.renderMatchScene(this.matchState);
    }
  }

  private toggleReplayPlaybackPause(): void {
    if (!this.replayPlayback) return;
    if (this.replayPlayback.finished) {
      this.restartReplay();
      return;
    }
    this.audio.playUiClick(false);
    toggleReplayPause(this.replayPlayback);
    this.syncHudRefs();
  }

  private cycleReplayPlaybackSpeed(): void {
    if (!this.replayPlayback) return;
    this.audio.playUiClick(false);
    cycleReplaySpeed(this.replayPlayback);
    this.syncHudRefs();
  }

  private restartReplay(): void {
    if (!this.replayPlayback) return;
    this.audio.playUiClick(true);
    this.matchState = restartReplayPlayback(this.replayPlayback);
    this.lastBannerSignature = '';
    this.lastRoundsSignature = '';
    this.audio.setSlowMoFactor(1);
    this.syncHudRefs();
    this.mainRenderer.renderMatchScene(this.matchState);
  }

  private pauseGame(): void {
    if (this.screen !== 'playing') return;
    this.clearAllInputs();
    if (this.mode !== 'online_1v1') {
      this.audio.stopBgm();
    }
    this.setScreen('paused');
  }

  private resumeGame(): void {
    if (this.screen !== 'paused') return;
    this.clearAllInputs();
    this.audio.startBgm();
    this.setScreen('playing');
    this.mainRenderer.canvas.focus();
  }

  private renderUI(): void {
    if (this.screen !== 'char_stage_select' && this.previewRenderer) {
      this.previewRenderer.dispose();
      this.previewRenderer = null;
    }
    this.uiLayerEl.innerHTML = '';
    this.portraitDeckEl.innerHTML = '';
    this.p1HpFillEl = null;
    this.p1HpTrailEl = null;
    this.p2HpFillEl = null;
    this.p2HpTrailEl = null;
    this.p1GuardFillEl = null;
    this.p2GuardFillEl = null;
    this.p1FsmTagEl = null;
    this.p2FsmTagEl = null;
    this.timerNumEl = null;
    this.roundTagEl = null;
    this.pingTagEl = null;
    this.bannerWrapEl = null;
    this.superFillEl = null;
    this.superLabelEl = null;
    this.superTouchBtnEl = null;
    this.comboEl = null;
    this.p1PipsEl = null;
    this.p2PipsEl = null;
    this.replayBadgeEl = null;
    this.replayProgressFillEl = null;
    this.replayTimeEl = null;
    this.replayPlayPauseBtnEl = null;
    this.replaySpeedBtnEl = null;
    this.chatDockEl = null;
    this.lastBannerSignature = '';
    this.lastRoundsSignature = '';

    if (this.screen === 'title') this.renderTitleUI();
    else if (this.screen === 'mode_select') this.renderModeSelectUI();
    else if (this.screen === 'online_lobby') this.renderOnlineLobbyUI();
    else if (this.screen === 'char_stage_select') this.renderCharStageSelectUI();
    else if (this.screen === 'playing') this.renderPlayingHUD(false);
    else if (this.screen === 'replay') this.renderPlayingHUD(true);
    else if (this.screen === 'paused') {
      this.renderPlayingHUD(false);
      this.renderPauseModal();
    } else if (this.screen === 'gameover') {
      this.renderPlayingHUD(false);
      this.renderGameOverModal();
    }

    if (
      this.mode === 'online_1v1' &&
      this.onlineRoomCode &&
      (this.screen === 'char_stage_select' ||
        this.screen === 'playing' ||
        this.screen === 'paused' ||
        this.screen === 'gameover')
    ) {
      this.renderLiveChatDock();
    }

    if (this.disconnectedModalOpen) {
      this.renderDisconnectModal();
    }
    if (this.showIOSInstallGuide) {
      this.renderIOSInstallModal();
    }
    if (this.showSettingsModal) {
      this.renderSettingsModal();
    }
    if (this.showUserProfileModal && this.authSession) {
      this.renderUserProfileModal();
    }
    if (this.showEditCharsModal && this.authSession) {
      this.renderEditCharsModal();
    }
    if (this.showAdminModal && this.authSession?.isAdmin) {
      this.renderAdminModal();
    }
    if (this.showAboutModal) {
      this.renderAboutModal();
    }
    if (this.showAuthModal) {
      this.renderAuthModal();
    }
    if (this.showDeleteAccountConfirm && this.authSession) {
      this.renderDeleteAccountConfirmModal();
    }
    if (this.pendingDeleteRoom) {
      this.renderDeleteRoomConfirmModal();
    }
    if (this.blockedAlertEmail) {
      this.renderBlockedAlertModal();
    }
  }

  private renderIOSInstallModal(): void {
    const backdrop = document.createElement('div');
    backdrop.className = 'sf-modal-backdrop';
    const card = document.createElement('div');
    card.className = 'sf-modal-card';
    card.innerHTML = `
      <div class="sf-index-badge" style="justify-content:center;margin-bottom:8px;"><span class="sf-red-pip"></span><span>INSTALASI PWA · iOS SAFARI</span></div>
      <h2 class="sf-modal-title">TAMBAH KE LAYAR UTAMA</h2>
      <p class="sf-mono sf-modal-copy" style="text-align:left;line-height:1.65;">
        01. Ketuk tombol BAGIKAN (SHARE) di bilah Safari.<br/>
        02. Gulir ke bawah lalu pilih TAMBAH KE LAYAR UTAMA.<br/>
        03. Buka ikon ADNANFIGHTER untuk mode layar penuh &amp; offline.
      </p>
    `;
    const closeBtn = document.createElement('button');
    closeBtn.className = 'sf-btn sf-btn-primary';
    closeBtn.style.width = '100%';
    closeBtn.textContent = 'TUTUP';
    closeBtn.addEventListener('click', () => {
      this.audio.playUiClick(false);
      this.showIOSInstallGuide = false;
      this.renderUI();
    });
    card.appendChild(closeBtn);
    backdrop.appendChild(card);
    this.uiLayerEl.appendChild(backdrop);
  }

  private openUserProfileModal(tab: 'profile' | 'history' = 'profile'): void {
    if (!this.authSession) {
      this.openAuthModal('login');
      return;
    }
    this.audio.playUiClick(false);
    this.showUserProfileModal = true;
    this.userProfileTab = tab;
    this.userDisplayNameDraft = this.authSession.displayName;
    this.userProfileAlert = null;
    this.userProfileBusy = false;
    this.startUserMatchHistorySubscription(this.authSession.uid);
    this.renderUI();
  }

  private renderUserProfileModal(): void {
    if (!this.authSession) return;
    const session = this.authSession;

    const backdrop = document.createElement('div');
    backdrop.className = 'sf-modal-backdrop sf-settings-backdrop';

    const card = document.createElement('div');
    card.className = 'sf-modal-card sf-modal-wide sf-modal-user';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'sf-user-profile-title');

    const headBadge = document.createElement('div');
    headBadge.className = 'sf-index-badge';
    headBadge.style.cssText = 'justify-content:center;margin-bottom:6px;';
    headBadge.innerHTML = `<span class="sf-red-pip"></span><span>HALAMAN USER · PROFIL &amp; RIWAYAT 1V1</span>`;
    card.appendChild(headBadge);

    const titleEl = document.createElement('h2');
    titleEl.className = 'sf-modal-title';
    titleEl.id = 'sf-user-profile-title';
    titleEl.style.textAlign = 'center';
    titleEl.textContent = session.displayName.toUpperCase();
    card.appendChild(titleEl);

    const tabsRow = document.createElement('div');
    tabsRow.className = 'sf-tabs-row is-2';
    tabsRow.setAttribute('role', 'tablist');

    const profileTabBtn = document.createElement('button');
    profileTabBtn.type = 'button';
    profileTabBtn.id = 'sf-user-tab-profile';
    profileTabBtn.className = 'sf-tab-btn';
    profileTabBtn.setAttribute('role', 'tab');
    profileTabBtn.setAttribute('aria-selected', String(this.userProfileTab === 'profile'));
    profileTabBtn.textContent = 'PROFIL & NAMA USER';
    profileTabBtn.addEventListener('click', () => {
      this.audio.playUiClick(false);
      this.userProfileTab = 'profile';
      this.userProfileAlert = null;
      this.renderUI();
    });

    const historyTabBtn = document.createElement('button');
    historyTabBtn.type = 'button';
    historyTabBtn.id = 'sf-user-tab-history';
    historyTabBtn.className = 'sf-tab-btn';
    historyTabBtn.setAttribute('role', 'tab');
    historyTabBtn.setAttribute('aria-selected', String(this.userProfileTab === 'history'));
    historyTabBtn.textContent = `RIWAYAT 1V1 (${this.userMatchHistory.length})`;
    historyTabBtn.addEventListener('click', () => {
      this.audio.playUiClick(false);
      this.userProfileTab = 'history';
      this.userProfileAlert = null;
      this.renderUI();
    });

    tabsRow.appendChild(profileTabBtn);
    tabsRow.appendChild(historyTabBtn);
    card.appendChild(tabsRow);

    if (this.userProfileAlert) {
      const alertBox = document.createElement('div');
      alertBox.className = `sf-form-alert ${this.userProfileAlert.type === 'error' ? 'is-error' : 'is-success'}`;
      alertBox.style.marginBottom = '12px';
      alertBox.textContent = this.userProfileAlert.text;
      card.appendChild(alertBox);
    }

    if (this.userProfileTab === 'profile') {
      const accountBox = document.createElement('div');
      accountBox.className = 'sf-admin-account-box';
      accountBox.innerHTML = `
        <div class="sf-admin-account-item">
          <div class="sf-admin-account-k">EMAIL AKUN</div>
          <div class="sf-admin-account-v" id="sf-user-email-val"></div>
        </div>
        <div class="sf-admin-account-item">
          <div class="sf-admin-account-k">STATUS &amp; UID</div>
          <div class="sf-admin-account-v" id="sf-user-uid-val"></div>
        </div>
      `;
      const emailVal = accountBox.querySelector('#sf-user-email-val');
      if (emailVal) emailVal.textContent = session.email;
      const uidVal = accountBox.querySelector('#sf-user-uid-val');
      if (uidVal) uidVal.textContent = `AKTIF · ${session.uid.slice(0, 12)}...`;
      card.appendChild(accountBox);

      const namePanel = document.createElement('form');
      namePanel.className = 'sf-user-name-panel';
      namePanel.innerHTML = `
        <div class="sf-settings-group-head">
          <span>NAMA USER PUBLIK (ONLINE 1V1 &amp; PERINGKAT)</span>
          <span>EDITABLE</span>
        </div>
      `;

      const nameRow = document.createElement('div');
      nameRow.className = 'sf-user-name-row';

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.id = 'sf-user-displayname-input';
      nameInput.className = 'sf-text-input';
      nameInput.minLength = MIN_USER_DISPLAY_NAME_LEN;
      nameInput.maxLength = MAX_USER_DISPLAY_NAME_LEN;
      nameInput.placeholder = 'Masukkan nama user (2-24 karakter)';
      nameInput.setAttribute('aria-label', 'Nama User Publik');
      nameInput.value = this.userDisplayNameDraft || session.displayName;
      nameInput.addEventListener('input', () => {
        this.userDisplayNameDraft = nameInput.value;
      });

      const saveNameBtn = document.createElement('button');
      saveNameBtn.type = 'submit';
      saveNameBtn.id = 'sf-user-displayname-save';
      saveNameBtn.className = 'sf-btn sf-btn-primary sf-btn-compact';
      saveNameBtn.disabled = this.userProfileBusy;
      saveNameBtn.textContent = this.userProfileBusy ? 'MENYIMPAN...' : 'SIMPAN NAMA';

      nameRow.appendChild(nameInput);
      nameRow.appendChild(saveNameBtn);
      namePanel.appendChild(nameRow);

      const nameHint = document.createElement('p');
      nameHint.className = 'sf-settings-hint';
      nameHint.textContent =
        'Perubahan nama user otomatis disinkronkan ke Daftar Juara / Peringkat pertandingan Online 1v1.';
      namePanel.appendChild(nameHint);

      namePanel.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (this.userProfileBusy) return;
        const cleaned = sanitizeUserDisplayName(this.userDisplayNameDraft);
        if (cleaned.length < MIN_USER_DISPLAY_NAME_LEN) {
          this.userProfileAlert = {
            type: 'error',
            text: `Nama user minimal ${MIN_USER_DISPLAY_NAME_LEN} karakter.`,
          };
          this.renderUI();
          return;
        }
        this.userProfileBusy = true;
        this.userProfileAlert = null;
        this.renderUI();
        try {
          const savedName = await updateUserDisplayName(session.uid, cleaned);
          if (this.authSession && this.authSession.uid === session.uid) {
            this.authSession = { ...this.authSession, displayName: savedName };
          }
          this.userDisplayNameDraft = savedName;
          this.userProfileBusy = false;
          this.userProfileAlert = {
            type: 'success',
            text: `Nama user "${savedName}" disimpan & otomatis diperbarui di papan peringkat Online 1v1.`,
          };
          this.renderUI();
        } catch (err) {
          this.userProfileBusy = false;
          this.userProfileAlert = {
            type: 'error',
            text: err instanceof Error ? err.message : 'Gagal memperbarui nama user.',
          };
          this.renderUI();
        }
      });

      card.appendChild(namePanel);

      const charSection = document.createElement('div');
      charSection.className = 'sf-settings-group';
      charSection.style.marginBottom = '14px';
      charSection.innerHTML = `
        <div class="sf-settings-group-head">
          <span>4 KARAKTER KELUARGA</span>
          <span>KUSTOMISASI</span>
        </div>
      `;
      const strip = document.createElement('div');
      strip.className = 'sf-settings-face-strip is-active';
      CHARACTER_ORDER.forEach((cid) => {
        const effectiveName = getEffectiveCharacterName(cid, session.customCharacters);
        const faceSrc = getEffectiveCharacterFaceSrc(cid, session.customCharacters);
        const tile = document.createElement('div');
        tile.className = 'sf-settings-face-tile';
        const thumb = document.createElement('div');
        thumb.className = 'sf-settings-face-thumb';
        const img = document.createElement('img');
        img.src = faceSrc;
        img.alt = effectiveName;
        thumb.appendChild(img);
        const lbl = document.createElement('span');
        lbl.className = 'sf-settings-face-name';
        lbl.textContent = effectiveName;
        tile.appendChild(thumb);
        tile.appendChild(lbl);
        strip.appendChild(tile);
      });
      charSection.appendChild(strip);

      const editCharShortcut = document.createElement('button');
      editCharShortcut.type = 'button';
      editCharShortcut.className = 'sf-btn sf-btn-compact';
      editCharShortcut.textContent = 'EDIT NAMA & FOTO WAJAH KARAKTER';
      editCharShortcut.addEventListener('click', () => {
        this.showUserProfileModal = false;
        this.openEditCharsModal();
      });
      charSection.appendChild(editCharShortcut);
      card.appendChild(charSection);

      const dangerZone = document.createElement('div');
      dangerZone.className = 'sf-user-danger-zone';
      dangerZone.innerHTML = `
        <div class="sf-user-danger-head">
          <span>ZONA BERBAHAYA · HAPUS AKUN</span>
          <span>PERMANEN</span>
        </div>
      `;

      const dangerDesc = document.createElement('p');
      dangerDesc.className = 'sf-settings-hint';
      dangerDesc.style.color = '#7F1D1D';
      dangerDesc.textContent =
        'Hapus akun Anda secara permanen beserta seluruh riwayat pertandingan 1v1, karakter kustom, peringkat, dan room yang Anda buat. Setelah terhapus, Anda dapat mendaftar akun baru dari awal.';
      dangerZone.appendChild(dangerDesc);

      const deleteAccBtn = document.createElement('button');
      deleteAccBtn.type = 'button';
      deleteAccBtn.id = 'sf-user-delete-account-btn';
      deleteAccBtn.className = 'sf-btn sf-btn-danger sf-btn-compact';
      deleteAccBtn.textContent = 'HAPUS AKUN & SEMUA RIWAYAT';
      deleteAccBtn.addEventListener('click', () => {
        this.audio.playUiClick(false);
        this.showDeleteAccountConfirm = true;
        this.deleteAccountPasswordInput = '';
        this.deleteAccountError = null;
        this.deleteAccountBusy = false;
        this.renderUI();
      });
      dangerZone.appendChild(deleteAccBtn);
      card.appendChild(dangerZone);
    } else {
      const stats = computeUserMatchStats(this.userMatchHistory);
      const statsGrid = document.createElement('div');
      statsGrid.className = 'sf-user-kpi-grid';
      statsGrid.innerHTML = `
        <div class="sf-user-kpi-tile"><div class="sf-stat-k">MATCH 1V1</div><div class="sf-stat-v">${stats.total}</div></div>
        <div class="sf-user-kpi-tile"><div class="sf-stat-k">MENANG</div><div class="sf-stat-v">${stats.wins}</div></div>
        <div class="sf-user-kpi-tile"><div class="sf-stat-k">KALAH</div><div class="sf-stat-v">${stats.losses}</div></div>
        <div class="sf-user-kpi-tile"><div class="sf-stat-k">WIN RATE</div><div class="sf-stat-v">${stats.winRate}%</div></div>
      `;
      card.appendChild(statsGrid);

      const listWrap = document.createElement('div');
      listWrap.className = 'sf-match-history-list';
      listWrap.id = 'sf-user-match-history-list';

      if (this.userMatchHistory.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'sf-active-rooms-empty';
        empty.textContent =
          'BELUM ADA RIWAYAT PERTANDINGAN ONLINE 1V1. MAINKAN MODE ONLINE 1V1 UNTUK MENCATAT HASIL.';
        listWrap.appendChild(empty);
      } else {
        for (const rec of this.userMatchHistory) {
          const isWin = rec.result === 'win';
          const row = document.createElement('div');
          row.className = `sf-match-history-row ${isWin ? 'is-win' : 'is-loss'}`;

          const topLine = document.createElement('div');
          topLine.className = 'sf-match-history-top';

          const resultTag = document.createElement('span');
          resultTag.className = `sf-match-result-tag ${isWin ? 'is-win' : 'is-loss'}`;
          resultTag.textContent = `${isWin ? 'MENANG' : 'KALAH'} · ${rec.myRoundsWon} - ${rec.opponentRoundsWon}`;

          const roomEl = document.createElement('span');
          roomEl.className = 'sf-match-room-name';
          roomEl.textContent = `ROOM: ${rec.roomName}`;

          topLine.appendChild(resultTag);
          topLine.appendChild(roomEl);
          row.appendChild(topLine);

          const oppLine = document.createElement('div');
          oppLine.className = 'sf-match-history-vs';
          const myCharLabel = rec.myCharName || CHARACTERS[rec.myCharId]?.name || rec.myCharId;
          const oppCharLabel =
            rec.opponentCharName || CHARACTERS[rec.opponentCharId]?.name || rec.opponentCharId;
          oppLine.textContent = `VS ${rec.opponentName} (${
            rec.opponentIsGuest ? 'GUEST' : 'USER'
          }) · ${myCharLabel} vs ${oppCharLabel}`;
          row.appendChild(oppLine);

          const metaLine = document.createElement('div');
          metaLine.className = 'sf-match-history-meta';
          const stageName = STAGES[rec.stageId]?.name || rec.stageId;
          metaLine.textContent = `${formatAdminTimestamp(rec.playedAt)} · DURASI ${formatMatchDuration(
            rec.durationMs
          )} · ${stageName.toUpperCase()}`;
          row.appendChild(metaLine);

          listWrap.appendChild(row);
        }
      }
      card.appendChild(listWrap);
    }

    const footer = document.createElement('div');
    footer.className = 'sf-admin-footer-actions';

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'sf-btn sf-btn-primary';
    closeBtn.id = 'sf-user-profile-close-btn';
    closeBtn.textContent = 'TUTUP';
    closeBtn.addEventListener('click', () => {
      this.audio.playUiClick(false);
      this.showUserProfileModal = false;
      this.renderUI();
    });

    const logoutBtn = document.createElement('button');
    logoutBtn.type = 'button';
    logoutBtn.className = 'sf-btn';
    logoutBtn.textContent = 'KELUAR AKUN';
    logoutBtn.addEventListener('click', () => {
      this.audio.playUiClick(false);
      this.showUserProfileModal = false;
      logoutAccount().catch(() => {});
    });

    footer.appendChild(closeBtn);
    footer.appendChild(logoutBtn);
    card.appendChild(footer);

    backdrop.appendChild(card);
    this.uiLayerEl.appendChild(backdrop);
  }

  private renderDeleteAccountConfirmModal(): void {
    if (!this.authSession) return;
    const session = this.authSession;

    const backdrop = document.createElement('div');
    backdrop.className = 'sf-modal-backdrop sf-settings-backdrop';

    const card = document.createElement('div');
    card.className = 'sf-modal-card sf-modal-confirm';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'sf-delete-acc-title');

    const badge = document.createElement('div');
    badge.className = 'sf-index-badge';
    badge.style.cssText = 'justify-content:center;margin-bottom:8px;';
    badge.innerHTML = `<span class="sf-red-pip"></span><span>KONFIRMASI PENGHAPUSAN AKUN</span>`;
    card.appendChild(badge);

    const title = document.createElement('h2');
    title.className = 'sf-modal-title';
    title.id = 'sf-delete-acc-title';
    title.style.textAlign = 'center';
    title.textContent = 'HAPUS AKUN PERMANEN?';
    card.appendChild(title);

    const warningBox = document.createElement('div');
    warningBox.className = 'sf-danger-warning-box';
    warningBox.id = 'sf-delete-acc-warning';
    warningBox.textContent = ACCOUNT_DELETE_WARNING_TEXT;
    card.appendChild(warningBox);

    const emailNote = document.createElement('div');
    emailNote.className = 'sf-mono';
    emailNote.style.cssText = 'font-size:10.5px;font-weight:700;margin-bottom:10px;';
    emailNote.textContent = `AKUN TARGET: ${session.email}`;
    card.appendChild(emailNote);

    if (this.deleteAccountError) {
      const errBox = document.createElement('div');
      errBox.className = 'sf-form-alert is-error';
      errBox.style.marginBottom = '10px';
      errBox.textContent = this.deleteAccountError;
      card.appendChild(errBox);
    }

    const form = document.createElement('form');
    form.className = 'sf-form-stack';

    const passGroup = document.createElement('div');
    passGroup.className = 'sf-field-group';
    const passLabel = document.createElement('label');
    passLabel.className = 'sf-field-label';
    passLabel.htmlFor = 'sf-delete-account-password';
    passLabel.textContent = 'MASUKKAN PASSWORD SAAT INI UNTUK KONFIRMASI';
    const passInput = document.createElement('input');
    passInput.type = 'password';
    passInput.id = 'sf-delete-account-password';
    passInput.className = 'sf-text-input';
    passInput.autocomplete = 'current-password';
    passInput.required = true;
    passInput.disabled = this.deleteAccountBusy;
    passInput.placeholder = 'Password akun Anda';
    passInput.value = this.deleteAccountPasswordInput;
    passInput.addEventListener('input', () => {
      this.deleteAccountPasswordInput = passInput.value;
    });
    passGroup.appendChild(passLabel);
    passGroup.appendChild(passInput);
    form.appendChild(passGroup);

    const actions = document.createElement('div');
    actions.className = 'sf-admin-footer-actions';
    actions.style.marginTop = '4px';

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'submit';
    confirmBtn.id = 'sf-confirm-delete-account-btn';
    confirmBtn.className = 'sf-btn sf-btn-danger';
    confirmBtn.disabled = this.deleteAccountBusy;
    confirmBtn.textContent = this.deleteAccountBusy
      ? 'MENGHAPUS AKUN...'
      : 'YA, HAPUS PERMANEN';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.id = 'sf-cancel-delete-account-btn';
    cancelBtn.className = 'sf-btn';
    cancelBtn.disabled = this.deleteAccountBusy;
    cancelBtn.textContent = 'BATAL';
    cancelBtn.addEventListener('click', () => {
      if (this.deleteAccountBusy) return;
      this.audio.playUiClick(false);
      this.showDeleteAccountConfirm = false;
      this.deleteAccountPasswordInput = '';
      this.deleteAccountError = null;
      this.renderUI();
    });

    actions.appendChild(confirmBtn);
    actions.appendChild(cancelBtn);
    form.appendChild(actions);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (this.deleteAccountBusy) return;
      const check = validateAccountDeletePassword(this.deleteAccountPasswordInput);
      if (!check.ok) {
        this.deleteAccountError = check.error;
        this.renderUI();
        return;
      }
      this.audio.playUiClick(true);
      this.deleteAccountBusy = true;
      this.deleteAccountError = null;
      this.renderUI();
      try {
        if (this.onlineRoomCode) {
          this.peerSession.detachDeletedRoom(this.onlineRoomCode, 'Akun dihapus.');
        }
        await deleteOwnAccountAndHistory(check.password);
        this.stopUserMatchHistorySubscription();
        this.userMatchHistory = [];
        this.userMatchHistoryUid = '';
        this.authSession = null;
        this.showDeleteAccountConfirm = false;
        this.showUserProfileModal = false;
        this.showEditCharsModal = false;
        this.showAdminModal = false;
        this.deleteAccountPasswordInput = '';
        this.deleteAccountBusy = false;
        this.deleteAccountError = null;
        this.syncRendererCustomFaces();
        this.showAuthModal = true;
        this.authTab = 'register';
        this.authEmailInput = '';
        this.authPassInput = '';
        this.authPassConfirmInput = '';
        this.authBusy = false;
        this.authAlert = {
          type: 'success',
          text: 'Akun dan seluruh riwayat Anda telah dihapus permanen. Anda sekarang dapat membuat akun baru dari awal.',
        };
        this.renderUI();
      } catch (err) {
        this.deleteAccountBusy = false;
        const code = (err as { code?: string } | null)?.code || '';
        this.deleteAccountError =
          code === 'auth/wrong-password' || code === 'auth/invalid-credential'
            ? 'Password salah. Penghapusan akun dibatalkan.'
            : code
              ? mapFirebaseAuthError(err)
              : err instanceof Error
                ? err.message
                : 'Gagal menghapus akun.';
        this.renderUI();
      }
    });

    card.appendChild(form);
    backdrop.appendChild(card);
    this.uiLayerEl.appendChild(backdrop);
  }

  private requestDeleteOnlineRoom(room: PublicRoomInfo): void {
    if (!canDeleteOnlineRoom(room, this.authSession)) return;
    this.audio.playUiClick(false);
    this.pendingDeleteRoom = room;
    this.roomDeleteBusy = false;
    this.roomDeleteError = null;
    this.renderUI();
  }

  private renderDeleteRoomConfirmModal(): void {
    const room = this.pendingDeleteRoom;
    if (!room) return;

    const backdrop = document.createElement('div');
    backdrop.className = 'sf-modal-backdrop sf-settings-backdrop';

    const card = document.createElement('div');
    card.className = 'sf-modal-card sf-modal-confirm';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'sf-delete-room-title');

    const badge = document.createElement('div');
    badge.className = 'sf-index-badge';
    badge.style.cssText = 'justify-content:center;margin-bottom:8px;';
    badge.innerHTML = `<span class="sf-red-pip"></span><span>KONFIRMASI HAPUS ROOM</span>`;
    card.appendChild(badge);

    const title = document.createElement('h2');
    title.className = 'sf-modal-title';
    title.id = 'sf-delete-room-title';
    title.style.textAlign = 'center';
    title.textContent = `HAPUS ROOM "${room.name}"?`;
    card.appendChild(title);

    const warningBox = document.createElement('div');
    warningBox.className = 'sf-danger-warning-box';
    warningBox.textContent =
      `Room #${room.id} (${room.isOnline ? 'ONLINE' : 'OFFLINE'}) beserta seluruh riwayat chat di dalamnya akan dihapus permanen dari daftar publik.`;
    card.appendChild(warningBox);

    if (this.roomDeleteError) {
      const errBox = document.createElement('div');
      errBox.className = 'sf-form-alert is-error';
      errBox.style.marginBottom = '10px';
      errBox.textContent = this.roomDeleteError;
      card.appendChild(errBox);
    }

    const actions = document.createElement('div');
    actions.className = 'sf-admin-footer-actions';

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.id = 'sf-confirm-delete-room-btn';
    confirmBtn.className = 'sf-btn sf-btn-danger';
    confirmBtn.disabled = this.roomDeleteBusy;
    confirmBtn.textContent = this.roomDeleteBusy ? 'MENGHAPUS...' : 'YA, HAPUS ROOM';
    confirmBtn.addEventListener('click', async () => {
      if (this.roomDeleteBusy) return;
      this.audio.playUiClick(true);
      this.roomDeleteBusy = true;
      this.roomDeleteError = null;
      this.renderUI();
      try {
        if (this.onlineRoomCode === room.id) {
          this.peerSession.detachDeletedRoom(room.id, `Room "${room.name}" telah dihapus.`);
        }
        await deleteOnlineRoomInDb(room.id, {
          uid: this.authSession?.uid || null,
          isAdmin: Boolean(this.authSession?.isAdmin),
        });
        this.onlineRooms = this.onlineRooms.filter((r) => r.id !== room.id);
        this.pendingDeleteRoom = null;
        this.roomDeleteBusy = false;
        this.roomDeleteError = null;
        if (this.showAdminModal) {
          this.adminAlert = {
            type: 'success',
            text: `Room "${room.name}" (#${room.id}) berhasil dihapus permanen.`,
          };
        } else if (this.screen === 'online_lobby') {
          this.onlineStatusDetail = `Room "${room.name}" telah dihapus.`;
        }
        this.renderUI();
      } catch (err) {
        this.roomDeleteBusy = false;
        this.roomDeleteError =
          err instanceof Error ? err.message : 'Gagal menghapus room dari database.';
        this.renderUI();
      }
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.id = 'sf-cancel-delete-room-btn';
    cancelBtn.className = 'sf-btn';
    cancelBtn.disabled = this.roomDeleteBusy;
    cancelBtn.textContent = 'BATAL';
    cancelBtn.addEventListener('click', () => {
      if (this.roomDeleteBusy) return;
      this.audio.playUiClick(false);
      this.pendingDeleteRoom = null;
      this.roomDeleteError = null;
      this.renderUI();
    });

    actions.appendChild(confirmBtn);
    actions.appendChild(cancelBtn);
    card.appendChild(actions);

    backdrop.appendChild(card);
    this.uiLayerEl.appendChild(backdrop);
  }

  private openSettingsModal(): void {
    this.audio.playUiClick(false);
    this.showSettingsModal = true;
    this.renderUI();
  }

  private renderSettingsModal(): void {
    const backdrop = document.createElement('div');
    backdrop.className = 'sf-modal-backdrop sf-settings-backdrop';

    const card = document.createElement('div');
    card.className = 'sf-modal-card sf-settings-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'sf-settings-title');
    card.innerHTML = `
      <div class="sf-index-badge" style="justify-content:center;margin-bottom:6px;">
        <span class="sf-red-pip"></span><span>00 · KONFIGURASI SISTEM</span>
      </div>
      <h2 class="sf-modal-title" id="sf-settings-title">PENGATURAN PERMAINAN</h2>
    `;

    const sections = document.createElement('div');
    sections.className = 'sf-settings-sections';

    // Section 01: Foto Wajah (Face Mask 3D + HUD Box Preview)
    const faceGroup = document.createElement('div');
    faceGroup.className = 'sf-settings-group';
    faceGroup.innerHTML = `
      <div class="sf-settings-group-head">
        <span>01 · TAMPILAN WAJAH KARAKTER</span>
        <span>${this.faceMaskEnabled ? 'FOTO WAJAH' : 'SKETSA DOODLE'}</span>
      </div>
    `;
    faceGroup.appendChild(this.createFaceMaskCheckbox('block'));

    const faceHint = document.createElement('p');
    faceHint.className = 'sf-settings-hint';
    faceHint.textContent =
      'Default aktif memakai foto wajah pada karakter 3D dan bingkai oval klasik di sudut HUD. Hapus centang jika ingin beralih ke wajah sketsa doodle.';
    faceGroup.appendChild(faceHint);

    const previewStrip = document.createElement('div');
    previewStrip.className = `sf-settings-face-strip${this.faceMaskEnabled ? ' is-active' : ''}`;
    previewStrip.id = 'sf-settings-face-strip';
    const customChars = this.authSession?.customCharacters || null;
    CHARACTER_ORDER.forEach((id) => {
      const effectiveName = getEffectiveCharacterName(id, customChars);
      const overrideFace = getCustomFaceOverride(id, customChars);
      const portrait = getHudFacePortraitSpec(id, true, overrideFace)!;
      const tile = document.createElement('div');
      tile.className = 'sf-settings-face-tile';

      const thumb = document.createElement('div');
      thumb.className = 'sf-settings-face-thumb';
      const img = document.createElement('img');
      img.src = portrait.src;
      img.alt = effectiveName;
      thumb.appendChild(img);

      const labelSpan = document.createElement('span');
      labelSpan.className = 'sf-settings-face-name';
      labelSpan.textContent = effectiveName.split(' ').slice(-1)[0] || effectiveName;

      tile.appendChild(thumb);
      tile.appendChild(labelSpan);
      previewStrip.appendChild(tile);
    });
    faceGroup.appendChild(previewStrip);

    const editShortcutBtn = document.createElement('button');
    editShortcutBtn.className = 'sf-btn sf-btn-compact';
    editShortcutBtn.id = 'sf-settings-edit-chars-btn';
    editShortcutBtn.textContent = this.authSession
      ? 'EDIT NAMA & FOTO WAJAH'
      : 'LOGIN UNTUK EDIT KARAKTER';
    editShortcutBtn.addEventListener('click', () => {
      this.audio.playUiClick(false);
      this.showSettingsModal = false;
      if (this.authSession) {
        this.openEditCharsModal();
      } else {
        this.openAuthModal('login');
      }
    });
    faceGroup.appendChild(editShortcutBtn);

    sections.appendChild(faceGroup);

    // Section 02: Audio, Virtual Touch Pad, Akun & Unduhan
    const sysGroup = document.createElement('div');
    sysGroup.className = 'sf-settings-group';
    sysGroup.innerHTML = `
      <div class="sf-settings-group-head">
        <span>02 · AUDIO, KONTROL &amp; AKUN</span>
        <span>SISTEM</span>
      </div>
    `;
    const sysRow = document.createElement('div');
    sysRow.className = 'sf-settings-btn-row';

    const audioBtn = document.createElement('button');
    audioBtn.className = 'sf-btn sf-btn-compact';
    audioBtn.setAttribute('aria-pressed', String(!this.audio.isMuted()));
    audioBtn.textContent = this.audio.isMuted() ? 'AUDIO: OFF' : 'AUDIO: ON';
    audioBtn.addEventListener('click', () => {
      const muted = this.audio.toggleMute();
      audioBtn.setAttribute('aria-pressed', String(!muted));
      audioBtn.textContent = muted ? 'AUDIO: OFF' : 'AUDIO: ON';
      if (!muted) this.audio.playUiClick(false);
      this.updateUtilityLabels();
    });

    const padBtn = document.createElement('button');
    padBtn.className = 'sf-btn sf-btn-compact';
    padBtn.setAttribute('aria-pressed', String(this.showTouchControls));
    padBtn.textContent = this.showTouchControls ? 'VIRTUAL PAD: ON' : 'VIRTUAL PAD: OFF';
    padBtn.addEventListener('click', () => {
      this.audio.playUiClick(false);
      this.userToggledTouch = true;
      this.showTouchControls = !this.showTouchControls;
      padBtn.setAttribute('aria-pressed', String(this.showTouchControls));
      padBtn.textContent = this.showTouchControls ? 'VIRTUAL PAD: ON' : 'VIRTUAL PAD: OFF';
    });

    const userAccountBtn = document.createElement('button');
    userAccountBtn.className = 'sf-btn sf-btn-compact';
    userAccountBtn.id = 'sf-settings-user-btn';
    userAccountBtn.textContent = this.authSession ? 'HALAMAN USER' : 'MASUK / DAFTAR';
    userAccountBtn.addEventListener('click', () => {
      this.showSettingsModal = false;
      if (this.authSession) {
        this.openUserProfileModal('profile');
      } else {
        this.openAuthModal('login');
      }
    });

    sysRow.appendChild(audioBtn);
    sysRow.appendChild(padBtn);
    sysRow.appendChild(userAccountBtn);

    if (this.options.enableOfflineDownload !== false) {
      const dlLink = document.createElement('a');
      dlLink.className = 'sf-btn sf-btn-compact';
      dlLink.textContent = 'UNDUH OFFLINE .HTML';
      dlLink.href = this.options.offlineHref || '/adnan-family-fighter.html';
      dlLink.download = 'adnan-family-fighter.html';
      sysRow.appendChild(dlLink);
    }

    sysGroup.appendChild(sysRow);
    sections.appendChild(sysGroup);

    card.appendChild(sections);

    const closeBtn = document.createElement('button');
    closeBtn.className = 'sf-btn sf-btn-primary';
    closeBtn.id = 'sf-settings-close-btn';
    closeBtn.style.width = '100%';
    closeBtn.textContent = 'SIMPAN & TUTUP';
    closeBtn.addEventListener('click', () => {
      this.audio.playUiClick(true);
      this.showSettingsModal = false;
      this.renderUI();
    });
    card.appendChild(closeBtn);

    backdrop.appendChild(card);
    this.uiLayerEl.appendChild(backdrop);
  }

  private syncHudPortraitFrames(): void {
    const slots: Array<{ slot: 1 | 2; containerId: string; charId?: CharacterId }> = [
      { slot: 1, containerId: 'sf-p1-portrait-slot', charId: this.matchState?.p1.charId },
      { slot: 2, containerId: 'sf-p2-portrait-slot', charId: this.matchState?.p2.charId },
    ];
    for (const item of slots) {
      const slotEl = document.getElementById(item.containerId);
      if (!slotEl || !item.charId) continue;
      const overrideFace = this.getSlotFaceOverride(item.slot, item.charId);
      const spec = getHudFacePortraitSpec(item.charId, this.faceMaskEnabled, overrideFace);
      if (!spec) {
        slotEl.innerHTML = '';
        slotEl.style.display = 'none';
      } else {
        const chName = this.getSlotCharacterName(item.slot, item.charId);
        slotEl.innerHTML = '';
        slotEl.style.display = '';

        const frame = document.createElement('div');
        frame.className = `sf-hud-portrait-frame sf-hud-portrait-oval is-p${item.slot}`;
        frame.dataset.testid = `hud-p${item.slot}-portrait`;
        frame.setAttribute('aria-label', `Foto wajah ${chName}`);

        const cameo = document.createElement('div');
        cameo.className = 'sf-hud-portrait-cameo';
        const img = document.createElement('img');
        img.className = 'sf-hud-portrait-img';
        img.src = spec.src;
        img.alt = chName;
        cameo.appendChild(img);

        frame.appendChild(cameo);
        frame.insertAdjacentHTML('beforeend', buildHudOvalFrameSvg(item.slot));
        slotEl.appendChild(frame);
      }
    }
  }

  private setFaceMaskEnabled(enabled: boolean): void {
    this.faceMaskEnabled = enabled;
    writeFaceMaskSetting(typeof window !== 'undefined' ? window.localStorage : null, enabled);
    this.mainRenderer?.setFaceMaskEnabled(enabled);
    this.previewRenderer?.setFaceMaskEnabled(enabled);

    document.querySelectorAll<HTMLInputElement>('.sf-face-mask-checkbox').forEach((input) => {
      input.checked = enabled;
      const label = input.closest('.sf-checkbox-toggle');
      if (label) {
        label.classList.toggle('is-checked', enabled);
        const statusEl = label.querySelector('.sf-checkbox-status');
        if (statusEl) statusEl.textContent = enabled ? 'AKTIF' : 'OFF';
      }
    });

    const faceStrip = document.getElementById('sf-settings-face-strip');
    if (faceStrip) {
      faceStrip.classList.toggle('is-active', enabled);
    }

    const groupStatus = faceStrip?.parentElement?.querySelector('.sf-settings-group-head > span:last-child');
    if (groupStatus) {
      groupStatus.textContent = enabled ? 'FOTO WAJAH' : 'SKETSA DOODLE';
    }

    if (this.screen === 'playing' || this.screen === 'paused' || this.screen === 'gameover' || this.screen === 'replay') {
      this.syncHudPortraitFrames();
    }

    if (this.screen === 'char_stage_select' && this.previewRenderer) {
      this.previewRenderer.render(this.elapsedTitle);
    } else if (this.screen === 'title') {
      this.mainRenderer.renderTitleShowcase(this.elapsedTitle);
    } else if (this.matchState) {
      this.mainRenderer.renderMatchScene(this.matchState);
    }
  }

  private createFaceMaskCheckbox(variant: 'compact' | 'block'): HTMLLabelElement {
    const label = document.createElement('label');
    label.className = `sf-checkbox-toggle${variant === 'block' ? ' sf-checkbox-toggle-block' : ''}${
      this.faceMaskEnabled ? ' is-checked' : ''
    }`;

    const leftWrap = document.createElement('span');
    leftWrap.className = 'sf-checkbox-label';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.className = 'sf-checkbox-input sf-face-mask-checkbox';
    input.checked = this.faceMaskEnabled;
    input.setAttribute('aria-label', 'Gunakan Foto Wajah (Face Masking)');
    input.addEventListener('change', () => {
      this.audio.playUiClick(false);
      this.setFaceMaskEnabled(input.checked);
    });

    const box = document.createElement('span');
    box.className = 'sf-checkbox-box';
    box.setAttribute('aria-hidden', 'true');

    const text = document.createElement('span');
    text.textContent = variant === 'block' ? 'GUNAKAN FOTO WAJAH' : 'FOTO WAJAH';

    leftWrap.appendChild(input);
    leftWrap.appendChild(box);
    leftWrap.appendChild(text);
    label.appendChild(leftWrap);

    const status = document.createElement('span');
    status.className = 'sf-checkbox-status';
    status.textContent = this.faceMaskEnabled ? 'AKTIF' : 'OFF';
    label.appendChild(status);

    return label;
  }

  private renderTitleUI(): void {
    const wrap = document.createElement('div');
    wrap.className = 'sf-title-overlay';

    // Top Swiss Architectural Utility Bar
    const topBar = document.createElement('div');
    topBar.className = 'sf-title-top-bar';

    const topMeta = document.createElement('div');
    topMeta.className = 'sf-title-top-meta';
    topMeta.innerHTML = `
      <span class="sf-index-badge"><span class="sf-red-pip"></span><span>00 · ADNAN FAMILY FIGHTER</span></span>
      <span>2.5D ARENA EDITION</span>
    `;
    topBar.appendChild(topMeta);

    const topActions = document.createElement('div');
    topActions.className = 'sf-title-top-actions';

    if (this.authSession) {
      const userNavBtn = document.createElement('button');
      userNavBtn.type = 'button';
      userNavBtn.className = 'sf-account-chip sf-account-chip-btn';
      userNavBtn.id = 'sf-btn-user-page';
      userNavBtn.title = 'Buka Halaman User & Riwayat 1v1';
      const accDot = document.createElement('span');
      accDot.className = 'sf-account-dot';
      const accLabel = document.createElement('span');
      accLabel.className = 'sf-account-chip-email';
      accLabel.textContent = this.authSession.displayName;
      userNavBtn.appendChild(accDot);
      userNavBtn.appendChild(accLabel);
      userNavBtn.addEventListener('click', () => {
        this.openUserProfileModal('profile');
      });
      topActions.appendChild(userNavBtn);

      if (this.authSession.isAdmin) {
        const adminBtn = document.createElement('button');
        adminBtn.className = 'sf-btn sf-btn-compact sf-btn-admin';
        adminBtn.id = 'sf-btn-admin';
        adminBtn.textContent = 'ADMIN';
        adminBtn.addEventListener('click', () => {
          this.openAdminModal();
        });
        topActions.appendChild(adminBtn);
      }

      const logoutBtn = document.createElement('button');
      logoutBtn.className = 'sf-btn sf-btn-compact';
      logoutBtn.id = 'sf-btn-logout';
      logoutBtn.textContent = 'KELUAR';
      logoutBtn.addEventListener('click', () => {
        this.audio.playUiClick(false);
        logoutAccount().catch(() => {});
      });
      topActions.appendChild(logoutBtn);
    } else {
      const accChip = document.createElement('div');
      accChip.className = 'sf-account-chip';
      accChip.id = 'sf-account-chip';
      const accDot = document.createElement('span');
      accDot.className = 'sf-account-dot is-guest';
      const accLabel = document.createElement('span');
      accLabel.className = 'sf-account-chip-email';
      accLabel.textContent = 'GUEST';
      accChip.appendChild(accDot);
      accChip.appendChild(accLabel);
      topActions.appendChild(accChip);

      const loginBtn = document.createElement('button');
      loginBtn.className = 'sf-btn sf-btn-compact';
      loginBtn.id = 'sf-btn-login';
      loginBtn.textContent = 'MASUK / DAFTAR';
      loginBtn.addEventListener('click', () => {
        this.openAuthModal('login');
      });
      topActions.appendChild(loginBtn);
    }

    const aboutBtn = document.createElement('button');
    aboutBtn.className = 'sf-btn sf-btn-compact';
    aboutBtn.id = 'sf-btn-about';
    aboutBtn.textContent = 'ABOUT';
    aboutBtn.addEventListener('click', () => {
      this.audio.playUiClick(false);
      this.showAboutModal = true;
      this.renderUI();
    });
    topActions.appendChild(aboutBtn);

    if (!this.isStandaloneInstalled && (this.deferredInstallPrompt || this.isIOS)) {
      const installBtn = document.createElement('button');
      installBtn.className = 'sf-btn sf-btn-compact';
      installBtn.id = 'sf-btn-install';
      installBtn.textContent = 'INSTALL APP';
      installBtn.addEventListener('click', () => {
        this.audio.playUiClick(true);
        if (this.deferredInstallPrompt) {
          const dp = this.deferredInstallPrompt;
          dp.prompt()
            .then(() => dp.userChoice)
            .then((res) => {
              if (res?.outcome === 'accepted') {
                this.isStandaloneInstalled = true;
                this.deferredInstallPrompt = null;
                this.renderUI();
              }
            })
            .catch(() => {});
        } else if (this.isIOS) {
          this.showIOSInstallGuide = true;
          this.renderUI();
        }
      });
      topActions.appendChild(installBtn);
    }
    topBar.appendChild(topActions);
    wrap.appendChild(topBar);

    // Centered Title Lockup & Clean Action Hierarchy
    const centerStage = document.createElement('div');
    centerStage.className = 'sf-title-center-stage';
    centerStage.innerHTML = `
      <div class="sf-title-meta-row">
        <span>01 · FAMILY COMBAT ARCHIVE</span>
        <span class="sf-index-badge"><span class="sf-red-pip"></span><span>3D DOODLE DUEL</span></span>
      </div>
      <div class="sf-title-hero-block">
        <div class="sf-title-kicker">
          <span class="sf-red-pip"></span>
          <span>FOUR FIGHTERS · EIGHT LANDMARK ARENAS</span>
        </div>
        <h1 class="sf-title-h1">
          ADNAN FAMILY <span class="sf-title-h1-accent">FIGHTER</span>
        </h1>
        <div class="sf-title-rule-bar" aria-hidden="true"></div>
        <p class="sf-title-desc">
          Pertarungan 2.5D bergaya sketsa garis tebal &amp; monumen arena 3D dengan mode Arcade, Training, dan Online 1v1.
        </p>
      </div>
      <div class="sf-title-actions" id="sf-title-actions"></div>
    `;

    const actions = centerStage.querySelector('#sf-title-actions')!;

    const startBtn = document.createElement('button');
    startBtn.className = 'sf-btn sf-btn-primary sf-title-start-btn';
    startBtn.textContent = 'MULAI BERMAIN';
    startBtn.dataset.start = 'true';
    startBtn.addEventListener('click', (e) => {
      e.currentTarget && (e.currentTarget as HTMLElement).blur();
      this.audio.playUiClick(true);
      this.setScreen('mode_select');
    });
    actions.appendChild(startBtn);

    const subGrid = document.createElement('div');
    subGrid.className = 'sf-title-sub-actions';

    if (this.authSession) {
      const profileBtn = document.createElement('button');
      profileBtn.className = 'sf-btn sf-btn-compact';
      profileBtn.id = 'sf-btn-open-user-modal';
      profileBtn.textContent = 'HALAMAN USER';
      profileBtn.addEventListener('click', () => {
        this.openUserProfileModal('profile');
      });
      subGrid.appendChild(profileBtn);

      const editCharBtn = document.createElement('button');
      editCharBtn.className = 'sf-btn sf-btn-compact';
      editCharBtn.id = 'sf-btn-edit-chars';
      editCharBtn.textContent = 'EDIT KARAKTER';
      editCharBtn.addEventListener('click', () => {
        this.openEditCharsModal();
      });
      subGrid.appendChild(editCharBtn);
    } else {
      const loginSubBtn = document.createElement('button');
      loginSubBtn.className = 'sf-btn sf-btn-compact';
      loginSubBtn.id = 'sf-btn-open-login-center';
      loginSubBtn.textContent = 'MASUK AKUN';
      loginSubBtn.addEventListener('click', () => {
        this.openAuthModal('login');
      });
      subGrid.appendChild(loginSubBtn);
    }

    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'sf-btn sf-btn-compact';
    settingsBtn.id = 'sf-btn-open-settings';
    settingsBtn.textContent = 'PENGATURAN';
    settingsBtn.addEventListener('click', () => {
      this.openSettingsModal();
    });
    subGrid.appendChild(settingsBtn);

    const muteBtn = document.createElement('button');
    muteBtn.className = 'sf-btn sf-btn-compact';
    muteBtn.textContent = this.audio.isMuted() ? 'AUDIO: OFF' : 'AUDIO: ON';
    muteBtn.addEventListener('click', () => {
      const m = this.audio.toggleMute();
      muteBtn.textContent = m ? 'AUDIO: OFF' : 'AUDIO: ON';
      if (!m) this.audio.playUiClick(false);
    });
    subGrid.appendChild(muteBtn);

    actions.appendChild(subGrid);

    const hint = document.createElement('div');
    hint.className = 'sf-control-hint';
    hint.textContent =
      'WASD / PANAH GERAK · 2X ARAH DASH · J PUKUL · K TENDANG · J+K BANTING · L SP · U TANGKIS · I SUPER';

    wrap.appendChild(centerStage);
    wrap.appendChild(hint);
    this.uiLayerEl.appendChild(wrap);
  }

  private renderModeSelectUI(): void {
    const wrap = document.createElement('div');
    wrap.className = 'sf-screen-overlay';
    wrap.style.pointerEvents = 'auto';

    const header = document.createElement('div');
    header.className = 'sf-screen-header';
    header.innerHTML = `
      <div class="sf-screen-title-group">
        <span class="sf-screen-index">02</span>
        <h1 class="sf-screen-title">PILIH MODE PERMAINAN</h1>
      </div>
    `;
    const backBtn = document.createElement('button');
    backBtn.className = 'sf-btn sf-btn-compact';
    backBtn.textContent = 'KEMBALI';
    backBtn.addEventListener('click', () => {
      this.audio.playUiClick(false);
      this.setScreen('title');
    });
    header.appendChild(backBtn);
    wrap.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'sf-mode-grid';

    const cpuCard = document.createElement('button');
    cpuCard.className = 'sf-mode-card';
    cpuCard.innerHTML = `
      <div>
        <div class="sf-mode-num">01</div>
        <div class="sf-mode-name">1P VS CPU</div>
      </div>
      <div class="sf-mode-desc">Pertarungan arkade melawan AI keluarga dengan timer 99 detik, sistem 3 ronde penentuan, dan skor kombo.</div>
      <span class="sf-mode-spec">ARCADE DUEL · BEST OF 3</span>
    `;
    cpuCard.addEventListener('click', () => {
      this.audio.playUiClick(true);
      this.mode = 'cpu';
      this.setScreen('char_stage_select');
    });

    const trainCard = document.createElement('button');
    trainCard.className = 'sf-mode-card';
    trainCard.innerHTML = `
      <div>
        <div class="sf-mode-num">02</div>
        <div class="sf-mode-name">TRAINING</div>
      </div>
      <div class="sf-mode-desc">Ruang uji coba offline tanpa batas waktu untuk melatih chain combo, jarak hitbox, dan Super Move.</div>
      <span class="sf-mode-spec">LATIHAN BEBAS · OFFLINE</span>
    `;
    trainCard.addEventListener('click', () => {
      this.audio.playUiClick(true);
      this.mode = 'training';
      this.setScreen('char_stage_select');
    });

    const onlineCard = document.createElement('button');
    onlineCard.className = 'sf-mode-card';
    onlineCard.innerHTML = `
      <div>
        <div class="sf-mode-num">03</div>
        <div class="sf-mode-name">ONLINE 1V1 (2 PERANGKAT)</div>
      </div>
      <div class="sf-mode-desc">Buat room dengan nama pilihanmu, pantau daftar juara peringkat 1v1, riwayat room 7 hari &amp; chat langsung.</div>
      <span class="sf-mode-spec">LIVE LOBBY · PERINGKAT 1V1 · 7 HARI</span>
    `;
    onlineCard.addEventListener('click', () => {
      this.audio.playUiClick(true);
      this.mode = 'online_1v1';
      this.onlineStatus = 'idle';
      this.onlineStatusDetail = 'Pilih Buat Room atau pilih room aktif di daftar.';
      this.onlineRoomCode = '';
      this.onlineRoomName = '';
      this.onlineRooms = [];
      this.onlineLobbyTab = 'rooms';
      this.setScreen('online_lobby');
      this.peerSession.connectLobby();
      this.startOnlineLeaderboardSubscription();
    });

    grid.appendChild(cpuCard);
    grid.appendChild(trainCard);
    grid.appendChild(onlineCard);
    wrap.appendChild(grid);

    const diffRow = document.createElement('div');
    diffRow.className = 'sf-diff-row';
    const diffLabel = document.createElement('span');
    diffLabel.className = 'sf-index-badge';
    diffLabel.innerHTML = `<span class="sf-red-pip"></span><span>LEVEL KESULITAN CPU (MODE 01)</span>`;
    diffRow.appendChild(diffLabel);

    const diffBtnGroup = document.createElement('div');
    diffBtnGroup.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';
    (['easy', 'normal', 'hard'] as CpuDifficulty[]).forEach((d) => {
      const btn = document.createElement('button');
      btn.className = 'sf-btn sf-btn-compact';
      btn.textContent = d === 'easy' ? 'MUDAH' : d === 'normal' ? 'NORMAL' : 'SUKAR';
      btn.setAttribute('aria-pressed', String(this.difficulty === d));
      btn.addEventListener('click', () => {
        this.audio.playUiClick(false);
        this.difficulty = d;
        this.renderUI();
      });
      diffBtnGroup.appendChild(btn);
    });
    diffRow.appendChild(diffBtnGroup);
    wrap.appendChild(diffRow);

    this.uiLayerEl.appendChild(wrap);
  }

  private refreshActiveRoomsListDom(): void {
    const listEl = document.getElementById('sf-active-rooms-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const rooms = this.onlineRooms;
    if (rooms.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'sf-active-rooms-empty';
      empty.textContent = 'BELUM ADA ROOM TERSEDIA DALAM 7 HARI TERAKHIR. BUAT ROOM BARU!';
      listEl.appendChild(empty);
      return;
    }

    const isHostingWaiting =
      this.onlineRole === 'host' &&
      (this.onlineStatus === 'waiting' || this.onlineStatus === 'initializing') &&
      Boolean(this.onlineRoomCode);

    for (const room of rooms) {
      const isMine = isHostingWaiting && room.id === this.onlineRoomCode;
      const row = document.createElement('div');
      row.className = `sf-active-room-row${isMine ? ' is-mine' : ''}${room.isOnline ? '' : ' is-offline'}`;

      const info = document.createElement('div');
      info.className = 'sf-active-room-info';

      const pill = document.createElement('div');
      pill.className = `sf-room-status-pill ${room.isOnline ? 'is-online' : 'is-offline'}`;
      const dot = document.createElement('span');
      dot.className = `sf-room-dot ${room.isOnline ? 'is-online' : 'is-offline'}`;
      const pillText = document.createElement('span');
      pillText.textContent = room.isOnline
        ? `ONLINE · ${room.playerCount}/2`
        : 'OFFLINE · RIWAYAT';
      pill.appendChild(dot);
      pill.appendChild(pillText);
      info.appendChild(pill);

      const nameEl = document.createElement('div');
      nameEl.className = 'sf-active-room-name';
      nameEl.textContent = room.name;

      const metaEl = document.createElement('div');
      metaEl.className = 'sf-active-room-meta';
      const creatorTag = room.creatorName ? ` · OLEH ${room.creatorName.toUpperCase()}` : '';
      if (isMine) {
        metaEl.textContent = `ROOM ANDA · MENUNGGU LAWAN (${room.playerCount}/2)`;
      } else if (room.isOnline) {
        metaEl.textContent = `${
          room.status === 'playing' ? 'SEDANG BERTANDING' : 'HOST SIAP'
        } · ${room.playerCount}/2 PEMAIN${creatorTag}`;
      } else {
        metaEl.textContent = `KOSONG · AKTIF ${formatRelativeRoomTime(room.lastActive || room.createdAt)}${creatorTag}`;
      }

      info.appendChild(nameEl);
      info.appendChild(metaEl);
      row.appendChild(info);

      const actionCluster = document.createElement('div');
      actionCluster.className = 'sf-active-room-actions';

      if (isMine) {
        const badge = document.createElement('span');
        badge.className = 'sf-index-badge';
        badge.innerHTML = `<span class="sf-red-pip"></span><span>MENUNGGU</span>`;
        actionCluster.appendChild(badge);
      } else if (!room.isOnline) {
        const reenterBtn = document.createElement('button');
        reenterBtn.className = 'sf-btn sf-btn-compact';
        reenterBtn.textContent = 'MASUK KEMBALI';
        reenterBtn.disabled = this.onlineStatus === 'connecting' || isHostingWaiting;
        reenterBtn.addEventListener('click', () => {
          this.audio.playUiClick(true);
          this.peerSession.reenterOfflineRoom(
            room.id,
            room.name,
            this.buildLocalRoomProfile(this.selectedP1)
          );
        });
        actionCluster.appendChild(reenterBtn);
      } else if (room.status === 'playing' || room.playerCount >= 2) {
        const fullBtn = document.createElement('button');
        fullBtn.className = 'sf-btn sf-btn-compact';
        fullBtn.textContent = 'PENUH';
        fullBtn.disabled = true;
        actionCluster.appendChild(fullBtn);
      } else {
        const joinBtn = document.createElement('button');
        joinBtn.className = 'sf-btn sf-btn-primary sf-btn-compact';
        const isConnectingThis =
          this.onlineRole === 'guest' &&
          this.onlineStatus === 'connecting' &&
          this.onlineRoomCode === room.id;
        joinBtn.textContent = isConnectingThis ? 'MASUK...' : 'GABUNG';
        joinBtn.disabled = this.onlineStatus === 'connecting' || isHostingWaiting;
        joinBtn.addEventListener('click', () => {
          this.audio.playUiClick(true);
          this.peerSession.joinRoom(
            room.id,
            room.name,
            this.buildLocalRoomProfile(this.selectedP2)
          );
        });
        actionCluster.appendChild(joinBtn);
      }

      if (canDeleteOnlineRoom(room, this.authSession)) {
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'sf-btn sf-btn-compact sf-btn-danger';
        delBtn.dataset.deleteRoomId = room.id;
        delBtn.textContent = 'HAPUS';
        delBtn.disabled = this.onlineStatus === 'connecting';
        delBtn.addEventListener('click', () => {
          this.requestDeleteOnlineRoom(room);
        });
        actionCluster.appendChild(delBtn);
      }

      row.appendChild(actionCluster);
      listEl.appendChild(row);
    }
  }

  private refreshOnlineLobbyTabCounts(): void {
    const roomsTab = document.getElementById('sf-online-tab-rooms');
    if (roomsTab) {
      roomsTab.textContent = `ROOM & RIWAYAT (${this.onlineRooms.length})`;
    }
    const lbTab = document.getElementById('sf-online-tab-leaderboard');
    if (lbTab) {
      lbTab.textContent = `DAFTAR JUARA (${this.onlineLeaderboard.length})`;
    }
  }

  private refreshLeaderboardListDom(): void {
    const listEl = document.getElementById('sf-leaderboard-list');
    if (!listEl) return;
    listEl.innerHTML = '';

    const entries = this.onlineLeaderboard;
    if (entries.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'sf-active-rooms-empty';
      empty.textContent =
        'BELUM ADA JUARA TERCATAT. SELESAIKAN PERTANDINGAN ONLINE 1V1 UNTUK MASUK PAPAN PERINGKAT!';
      listEl.appendChild(empty);
      return;
    }

    entries.forEach((entry, index) => {
      const rank = index + 1;
      const isMe = Boolean(this.authSession?.uid && entry.uid && entry.uid === this.authSession.uid);
      const winRate = computeLeaderboardWinRate(entry);

      const row = document.createElement('div');
      row.className = `sf-leaderboard-row${rank <= 3 ? ` is-top-${rank}` : ''}${isMe ? ' is-mine' : ''}`;

      const rankBox = document.createElement('div');
      rankBox.className = `sf-leaderboard-rank${rank === 1 ? ' is-champion' : ''}`;
      rankBox.textContent = `#${rank}`;

      const info = document.createElement('div');
      info.className = 'sf-leaderboard-info';

      const nameLine = document.createElement('div');
      nameLine.className = 'sf-leaderboard-name';
      nameLine.textContent = `${entry.name}${isMe ? ' (ANDA)' : ''}`;

      const metaLine = document.createElement('div');
      metaLine.className = 'sf-leaderboard-meta';
      const typeLabel = entry.isGuest ? 'GUEST · 1X' : 'USER';
      metaLine.textContent = `${typeLabel} · ${entry.wins}M - ${entry.losses}K (${entry.matches} MATCH)`;

      info.appendChild(nameLine);
      info.appendChild(metaLine);

      const scoreBox = document.createElement('div');
      scoreBox.className = 'sf-leaderboard-score';
      const winsEl = document.createElement('div');
      winsEl.className = 'sf-leaderboard-wins';
      winsEl.textContent = `${entry.wins} WIN`;
      const wrEl = document.createElement('div');
      wrEl.className = 'sf-leaderboard-wr';
      wrEl.textContent = `${winRate}% WR`;
      scoreBox.appendChild(winsEl);
      scoreBox.appendChild(wrEl);

      row.appendChild(rankBox);
      row.appendChild(info);
      row.appendChild(scoreBox);
      listEl.appendChild(row);
    });
  }

  private renderOnlineLobbyUI(): void {
    this.startOnlineLeaderboardSubscription();

    const wrap = document.createElement('div');
    wrap.className = 'sf-screen-overlay';
    wrap.style.pointerEvents = 'auto';

    const header = document.createElement('div');
    header.className = 'sf-screen-header';
    header.innerHTML = `
      <div class="sf-screen-title-group">
        <span class="sf-screen-index">03</span>
        <h1 class="sf-screen-title">ONLINE 1V1 · LOBBY &amp; PERINGKAT</h1>
      </div>
    `;
    const backBtn = document.createElement('button');
    backBtn.className = 'sf-btn sf-btn-compact';
    backBtn.textContent = 'KEMBALI';
    backBtn.addEventListener('click', () => {
      this.audio.playUiClick(false);
      this.leaveOnlineToMenu('mode_select');
    });
    header.appendChild(backBtn);
    wrap.appendChild(header);

    // Online Player Identity Strip
    const identity = this.getLocalUserIdentity();
    const idBar = document.createElement('div');
    idBar.className = 'sf-online-identity-bar';

    const idInfo = document.createElement('div');
    idInfo.className = 'sf-online-identity-info';
    const idDot = document.createElement('span');
    idDot.className = `sf-account-dot${identity.isGuest ? ' is-guest' : ''}`;
    const idText = document.createElement('span');
    idText.textContent = identity.isGuest
      ? 'BERMAIN SEBAGAI: GUEST (TERCATAT 1X PER PERTANDINGAN DI PERINGKAT)'
      : `BERMAIN SEBAGAI: ${identity.userName.toUpperCase()} (AKUN USER · PERINGKAT & RIWAYAT TERSIMPAN)`;
    idInfo.appendChild(idDot);
    idInfo.appendChild(idText);
    idBar.appendChild(idInfo);

    const idBtn = document.createElement('button');
    idBtn.type = 'button';
    idBtn.className = 'sf-btn sf-btn-compact';
    idBtn.id = 'sf-online-identity-btn';
    idBtn.textContent = identity.isGuest ? 'LOGIN AKUN' : 'UBAH NAMA / PROFIL';
    idBtn.addEventListener('click', () => {
      if (identity.isGuest) {
        this.openAuthModal('login');
      } else {
        this.openUserProfileModal('profile');
      }
    });
    idBar.appendChild(idBtn);
    wrap.appendChild(idBar);

    const grid = document.createElement('div');
    grid.className = 'sf-online-grid';

    // Card 1: BUAT ROOM (HOST / PLAYER 1)
    const hostCard = document.createElement('div');
    hostCard.className = 'sf-online-card';
    hostCard.innerHTML = `
      <div>
        <div class="sf-index-badge"><span class="sf-red-pip"></span><span>01 · PLAYER 1 HOST</span></div>
        <div class="sf-online-heading">BUAT ROOM</div>
        <p class="sf-online-copy">
          Tulis nama room bebas. Room akan langsung muncul otomatis di daftar publik &amp; riwayat tersimpan selama 7 hari.
        </p>
      </div>
    `;

    const isHostActive =
      this.onlineRole === 'host' &&
      (this.onlineStatus === 'initializing' || this.onlineStatus === 'waiting') &&
      Boolean(this.onlineRoomName);

    if (isHostActive) {
      const roomPanel = document.createElement('div');
      roomPanel.id = 'sf-online-room-panel';
      roomPanel.style.cssText = 'display:flex;flex-direction:column;gap:10px;';

      const codeBox = document.createElement('div');
      codeBox.className = 'sf-room-code-box';
      codeBox.textContent = this.onlineRoomName;
      roomPanel.appendChild(codeBox);

      const waitNote = document.createElement('div');
      waitNote.className = 'sf-mono';
      waitNote.style.cssText = 'font-size:11px;font-weight:700;text-align:center;letter-spacing:0.08em;';
      waitNote.textContent =
        this.onlineStatus === 'waiting'
          ? 'ROOM ONLINE · MENUNGGU LAWAN...'
          : 'MEMBUAT ROOM...';
      roomPanel.appendChild(waitNote);

      const resetRoomBtn = document.createElement('button');
      resetRoomBtn.className = 'sf-btn sf-btn-compact';
      resetRoomBtn.textContent = 'BATALKAN ROOM';
      resetRoomBtn.addEventListener('click', () => {
        this.audio.playUiClick(false);
        this.peerSession.cancelRoom();
      });

      roomPanel.appendChild(resetRoomBtn);
      hostCard.appendChild(roomPanel);
    } else {
      const hostActions = document.createElement('div');
      hostActions.style.cssText = 'display:flex;flex-direction:column;gap:10px;';

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.id = 'sf-room-name-input';
      nameInput.maxLength = 28;
      nameInput.placeholder = 'NAMA ROOM (MISAL: RUANG TAMU)';
      nameInput.className = 'sf-room-name-input';
      nameInput.setAttribute('aria-label', 'Nama Room');
      nameInput.value = this.onlineRoomNameInput;
      nameInput.addEventListener('input', () => {
        this.onlineRoomNameInput = nameInput.value;
      });
      nameInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this.audio.playUiClick(true);
          this.peerSession.createRoom(
            nameInput.value,
            this.buildLocalRoomProfile(this.selectedP1)
          );
        }
      });

      const createBtn = document.createElement('button');
      createBtn.className = 'sf-btn sf-btn-primary';
      createBtn.id = 'sf-online-create-btn';
      createBtn.textContent = 'BUAT ROOM BARU';
      createBtn.addEventListener('click', () => {
        this.audio.playUiClick(true);
        this.peerSession.createRoom(
          nameInput.value,
          this.buildLocalRoomProfile(this.selectedP1)
        );
      });

      hostActions.appendChild(nameInput);
      hostActions.appendChild(createBtn);
      hostCard.appendChild(hostActions);
    }

    // Card 2: TABBED DIRECTORY (ROOM & RIWAYAT 7 HARI + DAFTAR JUARA / PERINGKAT 1V1)
    const dirCard = document.createElement('div');
    dirCard.className = 'sf-online-card';

    const dirTop = document.createElement('div');
    const dirTabs = document.createElement('div');
    dirTabs.className = 'sf-tabs-row is-2';
    dirTabs.style.marginBottom = '10px';
    dirTabs.setAttribute('role', 'tablist');

    const roomsTabBtn = document.createElement('button');
    roomsTabBtn.type = 'button';
    roomsTabBtn.id = 'sf-online-tab-rooms';
    roomsTabBtn.className = 'sf-tab-btn';
    roomsTabBtn.setAttribute('role', 'tab');
    roomsTabBtn.setAttribute('aria-selected', String(this.onlineLobbyTab === 'rooms'));
    roomsTabBtn.textContent = `ROOM & RIWAYAT (${this.onlineRooms.length})`;
    roomsTabBtn.addEventListener('click', () => {
      this.audio.playUiClick(false);
      this.onlineLobbyTab = 'rooms';
      this.renderUI();
    });

    const lbTabBtn = document.createElement('button');
    lbTabBtn.type = 'button';
    lbTabBtn.id = 'sf-online-tab-leaderboard';
    lbTabBtn.className = 'sf-tab-btn';
    lbTabBtn.setAttribute('role', 'tab');
    lbTabBtn.setAttribute('aria-selected', String(this.onlineLobbyTab === 'leaderboard'));
    lbTabBtn.textContent = `DAFTAR JUARA (${this.onlineLeaderboard.length})`;
    lbTabBtn.addEventListener('click', () => {
      this.audio.playUiClick(false);
      this.onlineLobbyTab = 'leaderboard';
      this.renderUI();
    });

    dirTabs.appendChild(roomsTabBtn);
    dirTabs.appendChild(lbTabBtn);
    dirTop.appendChild(dirTabs);

    const dirDesc = document.createElement('p');
    dirDesc.className = 'sf-online-copy';
    dirDesc.id = 'sf-online-leaderboard-desc';
    dirDesc.style.marginTop = '0';
    dirDesc.textContent =
      this.onlineLobbyTab === 'rooms'
        ? 'Hijau (ONLINE): ada pemain aktif. Merah/Abu (OFFLINE): riwayat room <= 7 hari yang kosong dan dapat dimasuki kembali.'
        : this.onlineLeaderboardUsingFallback
          ? 'Peringkat Online 1v1 (sinkronisasi server aplikasi aktif). User login akumulatif; Guest tercatat 1 kali tiap bertanding.'
          : 'Peringkat Online 1v1 (User login akumulatif & sinkron nama otomatis; Guest tercatat 1 kali tiap bertanding).';
    dirTop.appendChild(dirDesc);
    dirCard.appendChild(dirTop);

    if (this.onlineLobbyTab === 'rooms') {
      const roomsListWrap = document.createElement('div');
      roomsListWrap.id = 'sf-active-rooms-list';
      roomsListWrap.className = 'sf-active-rooms-list';
      dirCard.appendChild(roomsListWrap);
    } else {
      const lbListWrap = document.createElement('div');
      lbListWrap.id = 'sf-leaderboard-list';
      lbListWrap.className = 'sf-leaderboard-list';
      dirCard.appendChild(lbListWrap);
    }

    grid.appendChild(hostCard);
    grid.appendChild(dirCard);
    wrap.appendChild(grid);

    const statusBar = document.createElement('div');
    statusBar.id = 'sf-online-status-bar';
    statusBar.className = `sf-status-bar${this.onlineStatus === 'connected' ? ' connected' : ''}`;
    const socketLabel = this.peerSession.isSocketOpen()
      ? `SERVER TERHUBUNG · ${this.onlineRooms.length} ROOM`
      : this.peerSession.isServerAvailable()
        ? 'MENYAMBUNG KE SERVER...'
        : 'MODE OFFLINE';

    const statusTextSpan = document.createElement('span');
    statusTextSpan.id = 'sf-online-status-text';
    statusTextSpan.textContent = `STATUS: ${this.onlineStatusDetail}`;
    const badgeSpan = document.createElement('span');
    badgeSpan.id = 'sf-online-server-badge';
    badgeSpan.textContent = socketLabel;
    statusBar.appendChild(statusTextSpan);
    statusBar.appendChild(badgeSpan);
    wrap.appendChild(statusBar);

    this.uiLayerEl.appendChild(wrap);
    if (this.onlineLobbyTab === 'rooms') {
      this.refreshActiveRoomsListDom();
    } else {
      this.refreshLeaderboardListDom();
    }
  }

  private renderCharStageSelectUI(): void {
    const isOnline = this.mode === 'online_1v1';
    const isHost = !isOnline || this.onlineRole === 'host';
    const localChar = isHost ? this.selectedP1 : this.selectedP2;

    const wrap = document.createElement('div');
    wrap.className = 'sf-screen-overlay';
    wrap.style.pointerEvents = 'auto';

    const header = document.createElement('div');
    header.className = 'sf-screen-header';
    const modeLabel =
      this.mode === 'cpu'
        ? '1P VS CPU'
        : this.mode === 'training'
          ? 'TRAINING'
          : `ONLINE 1V1 · ${isHost ? 'HOST 1P' : 'GUEST 2P'}`;
    header.innerHTML = `
      <div class="sf-screen-title-group">
        <span class="sf-screen-index">04</span>
        <h1 class="sf-screen-title">PETARUNG &amp; ARENA · ${modeLabel}</h1>
      </div>
    `;
    const headerBtns = document.createElement('div');
    headerBtns.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;';

    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'sf-btn sf-btn-compact';
    settingsBtn.id = 'sf-btn-open-settings';
    settingsBtn.textContent = 'PENGATURAN';
    settingsBtn.addEventListener('click', () => this.openSettingsModal());
    headerBtns.appendChild(settingsBtn);

    const backBtn = document.createElement('button');
    backBtn.className = 'sf-btn sf-btn-compact';
    backBtn.textContent = isOnline ? 'PUTUSKAN ROOM' : 'KEMBALI';
    backBtn.addEventListener('click', () => {
      this.audio.playUiClick(false);
      if (isOnline) this.leaveOnlineToMenu('mode_select');
      else this.setScreen('mode_select');
    });
    headerBtns.appendChild(backBtn);
    header.appendChild(headerBtns);
    wrap.appendChild(header);

    const layout = document.createElement('div');
    layout.className = 'sf-select-layout';

    // Col 1: 4 Family Characters (Numbered Swiss Index)
    const col1 = document.createElement('div');
    col1.className = 'sf-select-col';
    col1.innerHTML = `
      <div class="sf-col-head">
        <span>01 · ROSTER KELUARGA</span>
        <span>${isOnline ? (isHost ? '1P HOST' : '2P GUEST') : '1P LOCAL'}</span>
      </div>
    `;
    const roster = document.createElement('div');
    roster.className = 'sf-roster-grid';

    CHARACTER_ORDER.forEach((id, idx) => {
      const ch = CHARACTERS[id];
      const num = String(idx + 1).padStart(2, '0');
      const displayName = getEffectiveCharacterName(id, this.authSession?.customCharacters);
      const btn = document.createElement('button');
      btn.className = 'sf-char-btn';
      btn.setAttribute('aria-pressed', String(localChar === id));

      const metaSpan = document.createElement('span');
      metaSpan.className = 'sf-char-meta';
      metaSpan.textContent = `${num} · ${ch.archetype}`;
      const nameSpan = document.createElement('span');
      nameSpan.className = 'sf-char-name';
      nameSpan.textContent = displayName;
      const weaponSpan = document.createElement('span');
      weaponSpan.className = 'sf-char-weapon';
      weaponSpan.textContent = ch.visual.weaponName;
      btn.appendChild(metaSpan);
      btn.appendChild(nameSpan);
      btn.appendChild(weaponSpan);

      btn.addEventListener('click', () => {
        this.audio.playUiClick(false);
        if (isOnline) {
          const prof = this.buildLocalRoomProfile(id);
          this.peerSession.syncLocalRoomProfile(prof);
          if (isHost) {
            this.selectedP1 = id;
            this.peerSession.sendReliable({
              t: 'lobby_pick',
              charId: id,
              ready: true,
              stageId: this.selectedStage,
              customName: prof.name,
              customFace: prof.faceBase64,
            });
          } else {
            this.selectedP2 = id;
            this.peerSession.sendReliable({
              t: 'lobby_pick',
              charId: id,
              ready: this.onlineGuestReady,
              customName: prof.name,
              customFace: prof.faceBase64,
            });
          }
        } else {
          this.selectedP1 = id;
          if (this.selectedP2 === id) {
            const nextIdx = (CHARACTER_ORDER.indexOf(id) + 1) % CHARACTER_ORDER.length;
            this.selectedP2 = CHARACTER_ORDER[nextIdx];
          }
        }
        this.syncRendererCustomFaces();
        this.renderUI();
      });
      roster.appendChild(btn);
    });
    col1.appendChild(roster);

    if (isOnline) {
      const oppBox = document.createElement('div');
      oppBox.className = 'sf-card';
      oppBox.style.marginTop = '12px';
      const oppId = isHost ? this.selectedP2 : this.selectedP1;
      const oppChar = CHARACTERS[oppId];
      const oppDisplayName = this.getSlotCharacterName(isHost ? 2 : 1, oppId);
      oppBox.innerHTML = `
        <div class="sf-index-badge"><span class="sf-red-pip"></span><span>${
          isHost ? 'PILIHAN LAWAN (2P GUEST)' : 'PILIHAN LAWAN (1P HOST)'
        }</span></div>
        <div class="sf-opp-name"></div>
        <div class="sf-opp-sub">${oppChar.archetype} · ${oppChar.secretWeapon}</div>
        ${
          isHost
            ? `<div class="sf-opp-status">STATUS GUEST: ${
                this.onlineGuestReady ? 'SIAP BERTARUNG' : 'SEDANG MEMILIH...'
              }</div>`
            : `<div class="sf-opp-status">ARENA: ${STAGES[this.selectedStage].name}</div>`
        }
      `;
      const oppNameEl = oppBox.querySelector('.sf-opp-name');
      if (oppNameEl) oppNameEl.textContent = oppDisplayName;
      col1.appendChild(oppBox);
    } else {
      const oppHead = document.createElement('div');
      oppHead.className = 'sf-col-head';
      oppHead.style.marginTop = '14px';
      oppHead.innerHTML = `<span>${this.mode === 'cpu' ? 'LAWAN CPU (2P)' : 'DUMMY LATIHAN (2P)'}</span><span>AI</span>`;
      col1.appendChild(oppHead);

      const oppRow = document.createElement('div');
      oppRow.style.cssText = 'display:flex;flex-wrap:wrap;gap:6px;';
      CHARACTER_ORDER.forEach((id) => {
        const oppCustomName = getEffectiveCharacterName(id, this.authSession?.customCharacters);
        const btn = document.createElement('button');
        btn.className = 'sf-btn sf-btn-compact';
        btn.textContent = oppCustomName.split(' ').slice(-1)[0] || oppCustomName;
        btn.setAttribute('aria-pressed', String(this.selectedP2 === id));
        btn.addEventListener('click', () => {
          this.audio.playUiClick(false);
          this.selectedP2 = id;
          this.syncRendererCustomFaces();
          this.renderUI();
        });
        oppRow.appendChild(btn);
      });
      col1.appendChild(oppRow);
    }

    const spec = CHARACTERS[localChar];
    const localDisplayName = this.getSlotCharacterName(isHost ? 1 : 2, localChar);
    const bioBox = document.createElement('div');
    bioBox.style.cssText = 'margin-top:auto;padding-top:10px;';
    bioBox.innerHTML = `
      <div class="sf-col-head" style="margin-bottom:8px;">
        <span>PROFIL KARAKTER</span>
        <span>${spec.archetype}</span>
      </div>
      <div class="sf-stat-mini-grid">
        <div class="sf-stat-mini-cell">
          <div class="sf-stat-mini-label">MAX HP</div>
          <div class="sf-stat-mini-val">${spec.maxHp}</div>
        </div>
        <div class="sf-stat-mini-cell">
          <div class="sf-stat-mini-label">SPEED</div>
          <div class="sf-stat-mini-val">${spec.walkSpeed}</div>
        </div>
        <div class="sf-stat-mini-cell">
          <div class="sf-stat-mini-label">HEIGHT</div>
          <div class="sf-stat-mini-val">${spec.standingHeight}</div>
        </div>
      </div>
      <p class="sf-char-summary">${spec.summary}</p>
    `;
    col1.appendChild(bioBox);
    layout.appendChild(col1);

    // Col 2: Live Three.js 3D Preview + Technical Moveset Spec
    const col2 = document.createElement('div');
    col2.className = 'sf-select-col sf-preview-box';
    const col2Head = document.createElement('div');
    col2Head.className = 'sf-col-head';
    col2Head.innerHTML = `<span>02 · INSPEKSI 3D</span><span>HP ${spec.maxHp}</span>`;
    col2.appendChild(col2Head);

    const previewStage = document.createElement('div');
    previewStage.className = 'sf-preview-canvas-wrap';
    const localFaceOverride = getCustomFaceOverride(
      localChar,
      this.authSession?.customCharacters || null
    );
    if (!this.previewRenderer) {
      this.previewRenderer = new ThreePreviewRenderer(
        previewStage,
        localChar,
        440,
        260,
        this.faceMaskEnabled,
        localFaceOverride
      );
    } else {
      this.previewRenderer.setCharacter(localChar);
      this.previewRenderer.setFaceMaskEnabled(this.faceMaskEnabled);
      this.previewRenderer.setCustomFaceUrl(localFaceOverride);
      previewStage.appendChild(this.previewRenderer.canvas);
    }
    this.previewRenderer.render(this.elapsedTitle);

    const infoDiv = document.createElement('div');
    infoDiv.innerHTML = `
      <div class="sf-preview-head-row">
        <span class="sf-preview-name"></span>
        <span class="sf-preview-weapon">${spec.secretWeapon.toUpperCase()}</span>
      </div>
      <div class="sf-preview-age">${spec.ageLabel}</div>
      <ul class="sf-moves-list">
        <li>${spec.specialDescriptions.neutral}</li>
        <li>${spec.specialDescriptions.upFwd}</li>
        <li>${spec.specialDescriptions.back}</li>
        <li>${spec.specialDescriptions.down}</li>
        <li>${spec.specialDescriptions.passive}</li>
        <li>${spec.specialDescriptions.superMove}</li>
      </ul>
    `;
    const prevNameEl = infoDiv.querySelector('.sf-preview-name');
    if (prevNameEl) prevNameEl.textContent = localDisplayName;
    col2.appendChild(previewStage);
    col2.appendChild(infoDiv);
    layout.appendChild(col2);

    // Col 3: 3D Arena Stages + Start Match CTA
    const col3 = document.createElement('div');
    col3.className = 'sf-select-col sf-select-col-stages';

    const stageWrap = document.createElement('div');
    stageWrap.className = 'sf-stage-wrap';
    stageWrap.innerHTML = `
      <div class="sf-col-head" style="margin-bottom:6px;">
        <span>03 · LOKASI ARENA 3D</span>
        <span>${isOnline && !isHost ? 'HOST LOCK' : 'MONUMEN'}</span>
      </div>
    `;
    const stageStack = document.createElement('div');
    stageStack.className = 'sf-stage-stack';

    STAGE_ORDER.forEach((sid, idx) => {
      const st = STAGES[sid];
      const num = String(idx + 1).padStart(2, '0');
      const btn = document.createElement('button');
      btn.className = 'sf-stage-btn';
      btn.dataset.stageId = sid;
      btn.setAttribute('aria-pressed', String(this.selectedStage === sid));
      if (isOnline && !isHost) {
        btn.disabled = true;
        btn.style.cursor = 'default';
      }
      btn.innerHTML = `
        <div class="sf-stage-top">
          <span class="sf-stage-meta">ARENA ${num}</span>
          <span class="sf-stage-meta">${st.subtitle.split('·')[0].trim()}</span>
        </div>
        <span class="sf-stage-name">${st.name}</span>
      `;
      if (!isOnline || isHost) {
        btn.addEventListener('click', () => {
          this.audio.playUiClick(false);
          this.selectedStage = sid;
          if (isOnline) {
            const prof = this.buildLocalRoomProfile(this.selectedP1);
            this.peerSession.sendReliable({
              t: 'lobby_pick',
              charId: this.selectedP1,
              ready: true,
              stageId: this.selectedStage,
              customName: prof.name,
              customFace: prof.faceBase64,
            });
          }
          this.renderUI();
        });
      }
      stageStack.appendChild(btn);
    });
    stageWrap.appendChild(stageStack);
    col3.appendChild(stageWrap);

    if (isOnline && !isHost) {
      const guestCol = document.createElement('div');
      guestCol.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

      const readyBtn = document.createElement('button');
      readyBtn.className = 'sf-btn sf-btn-primary';
      readyBtn.style.width = '100%';
      readyBtn.setAttribute('aria-pressed', String(this.onlineGuestReady));
      readyBtn.textContent = this.onlineGuestReady ? 'BATAL SIAP' : 'SIAP BERTARUNG';
      readyBtn.addEventListener('click', () => {
        this.audio.playUiClick(true);
        this.onlineGuestReady = !this.onlineGuestReady;
        const prof = this.buildLocalRoomProfile(this.selectedP2);
        this.peerSession.sendReliable({
          t: 'lobby_pick',
          charId: this.selectedP2,
          ready: this.onlineGuestReady,
          customName: prof.name,
          customFace: prof.faceBase64,
        });
        this.renderUI();
      });

      const waitHost = document.createElement('div');
      waitHost.className = 'sf-mono';
      waitHost.style.cssText =
        'border:1.5px solid #111111;background:#E5E5E5;padding:8px;font-size:10.5px;font-weight:700;text-align:center;';
      waitHost.textContent = 'MENUNGGU HOST MEMULAI PERTARUNGAN...';

      guestCol.appendChild(readyBtn);
      guestCol.appendChild(waitHost);
      col3.appendChild(guestCol);
    } else {
      const fightBtn = document.createElement('button');
      fightBtn.className = 'sf-btn sf-btn-primary';
      fightBtn.style.width = '100%';
      fightBtn.textContent = 'MULAI PERTARUNGAN';
      fightBtn.dataset.startMatch = 'true';
      fightBtn.addEventListener('click', () => {
        this.audio.playUiClick(true);
        if (isOnline) {
          this.sendMatchStartToGuest();
        }
        this.startMatch();
      });
      col3.appendChild(fightBtn);
    }

    layout.appendChild(col3);
    wrap.appendChild(layout);
    this.uiLayerEl.appendChild(wrap);
  }

  private renderPlayingHUD(isReplay = false): void {
    if (!this.matchState) return;
    const m = this.matchState;
    const p1Name = this.getSlotCharacterName(1, m.p1.charId);
    const p2Name = this.getSlotCharacterName(2, m.p2.charId);
    const isOnline = m.mode === 'online_1v1';

    const hud = document.createElement('div');
    hud.className = 'sf-hud-layer';

    const top = document.createElement('div');
    top.className = 'sf-hud-top';

    const p1Label = isOnline
      ? `01 · ${p1Name}${this.onlineRole === 'host' ? ' (ANDA)' : ' (HOST)'}`
      : `01 · ${p1Name}`;
    const p2Label =
      m.mode === 'training'
        ? `${p2Name} · DUMMY`
        : isOnline
          ? `${p2Name} · 02${this.onlineRole === 'guest' ? ' (ANDA)' : ' (GUEST)'}`
          : `${p2Name} · CPU`;

    // P1 HUD
    const p1Hud = document.createElement('div');
    p1Hud.className = 'sf-fighter-hud';
    p1Hud.innerHTML = `
      <div class="sf-hud-fighter-row">
        <div class="sf-hud-portrait-slot" id="sf-p1-portrait-slot"></div>
        <div class="sf-hud-fighter-body">
          <div class="sf-hud-name-row">
            <span id="sf-p1-name-label"></span>
            <div class="sf-rounds-row" id="sf-p1-pips"></div>
          </div>
          <div class="sf-hp-outer">
            <div class="sf-hp-trail sf-p1-hp" id="sf-p1-trail" style="width:100%;"></div>
            <div class="sf-hp-fill sf-p1-hp" id="sf-p1-fill" style="width:100%;"></div>
          </div>
          <div class="sf-guard-outer">
            <div class="sf-guard-fill sf-p1-hp" id="sf-p1-guard-fill" style="width:100%;"></div>
          </div>
          <div class="sf-hud-status-row">
            <div class="sf-fsm-tag" id="sf-p1-fsm" style="display:none;"></div>
            <div class="sf-combo-tag" id="sf-p1-combo" style="display:none;"></div>
          </div>
        </div>
      </div>
    `;
    const p1NameSpan = p1Hud.querySelector('#sf-p1-name-label');
    if (p1NameSpan) p1NameSpan.textContent = p1Label;

    // Timer Box
    const timerBox = document.createElement('div');
    timerBox.className = 'sf-timer-box';
    timerBox.innerHTML = `
      <div class="sf-round-tag" id="sf-round-tag">${m.mode === 'training' ? 'TRAINING' : `ROUND 0${m.roundNumber}`}</div>
      <div class="sf-timer-num" id="sf-timer-num">${m.mode === 'training' ? '∞' : '99'}</div>
    `;

    // P2 HUD
    const p2Hud = document.createElement('div');
    p2Hud.className = 'sf-fighter-hud sf-fighter-hud-right';
    p2Hud.innerHTML = `
      <div class="sf-hud-fighter-row sf-hud-fighter-row-right">
        <div class="sf-hud-fighter-body sf-hud-fighter-body-right">
          <div class="sf-hud-name-row">
            <div class="sf-rounds-row" id="sf-p2-pips"></div>
            <span id="sf-p2-name-label"></span>
          </div>
          <div class="sf-hp-outer">
            <div class="sf-hp-trail sf-p2-hp" id="sf-p2-trail" style="width:100%;"></div>
            <div class="sf-hp-fill sf-p2-hp" id="sf-p2-fill" style="width:100%;"></div>
          </div>
          <div class="sf-guard-outer">
            <div class="sf-guard-fill sf-p2-hp" id="sf-p2-guard-fill" style="width:100%;"></div>
          </div>
          <div class="sf-hud-status-row sf-hud-status-row-right">
            <div class="sf-fsm-tag" id="sf-p2-fsm" style="display:none;"></div>
          </div>
        </div>
        <div class="sf-hud-portrait-slot" id="sf-p2-portrait-slot"></div>
      </div>
    `;
    const p2NameSpan = p2Hud.querySelector('#sf-p2-name-label');
    if (p2NameSpan) p2NameSpan.textContent = p2Label;

    top.appendChild(p1Hud);
    top.appendChild(timerBox);
    top.appendChild(p2Hud);
    hud.appendChild(top);

    if (isOnline) {
      const pingTag = document.createElement('div');
      pingTag.className = 'sf-ping-tag';
      pingTag.id = 'sf-ping-tag';
      pingTag.textContent = this.onlinePingMs > 0 ? `PING: ${this.onlinePingMs}ms` : 'PING: --ms';
      hud.appendChild(pingTag);
    }

    if (isReplay) {
      const replayBadge = document.createElement('div');
      replayBadge.className = 'sf-replay-badge';
      replayBadge.id = 'sf-replay-badge';
      replayBadge.innerHTML = `<span class="sf-red-pip"></span><span id="sf-replay-badge-txt">REPLAY · 1.00X</span>`;
      hud.appendChild(replayBadge);
      this.replayBadgeEl = replayBadge;
    }

    // Compact Top-Right Utility Buttons (in landscape inside HUD; in portrait inside bottom deck)
    const utils = document.createElement('div');
    utils.className = 'sf-hud-utils';

    const muteBtn = document.createElement('button');
    muteBtn.className = 'sf-btn sf-btn-compact';
    muteBtn.id = 'sf-btn-mute';
    muteBtn.tabIndex = -1;
    muteBtn.textContent = this.audio.isMuted() ? 'MUTE' : 'SFX';
    muteBtn.setAttribute('aria-label', 'Toggle Audio');
    muteBtn.addEventListener('click', (e) => {
      e.currentTarget && (e.currentTarget as HTMLElement).blur();
      this.audio.toggleMute();
      this.updateUtilityLabels();
    });

    if (isReplay) {
      utils.appendChild(muteBtn);
      const exitBtn = document.createElement('button');
      exitBtn.className = 'sf-btn sf-btn-compact';
      exitBtn.id = 'sf-btn-replay-exit-top';
      exitBtn.tabIndex = -1;
      exitBtn.textContent = 'KELUAR';
      exitBtn.setAttribute('aria-label', 'Keluar Replay');
      exitBtn.addEventListener('click', (e) => {
        e.currentTarget && (e.currentTarget as HTMLElement).blur();
        this.audio.playUiClick(false);
        this.exitReplay();
      });
      utils.appendChild(exitBtn);
    } else {
      const touchToggleBtn = document.createElement('button');
      touchToggleBtn.className = 'sf-btn sf-btn-compact';
      touchToggleBtn.id = 'sf-btn-touch-toggle';
      touchToggleBtn.tabIndex = -1;
      touchToggleBtn.textContent = this.showTouchControls ? 'PAD: ON' : 'PAD: OFF';
      touchToggleBtn.setAttribute('aria-label', 'Toggle Virtual Pad');
      touchToggleBtn.addEventListener('click', (e) => {
        e.currentTarget && (e.currentTarget as HTMLElement).blur();
        this.userToggledTouch = true;
        this.showTouchControls = !this.showTouchControls;
        this.renderUI();
      });

      const pauseBtn = document.createElement('button');
      pauseBtn.className = 'sf-btn sf-btn-compact';
      pauseBtn.tabIndex = -1;
      pauseBtn.textContent = 'PAUSE';
      pauseBtn.setAttribute('aria-label', 'Pause Game');
      pauseBtn.addEventListener('click', (e) => {
        e.currentTarget && (e.currentTarget as HTMLElement).blur();
        this.pauseGame();
      });

      utils.appendChild(touchToggleBtn);
      utils.appendChild(muteBtn);
      utils.appendChild(pauseBtn);
    }

    const isPortrait = this.isPortraitViewport();
    if (!isPortrait) {
      hud.appendChild(utils);
    }

    // Center Banner container
    const bannerWrap = document.createElement('div');
    bannerWrap.className = 'sf-banner-wrap';
    bannerWrap.id = 'sf-banner-wrap';
    hud.appendChild(bannerWrap);

    // Bottom Super Meter or Replay Bar
    const bottom = document.createElement('div');
    bottom.className = 'sf-bottom-hud';
    if (isReplay) {
      if (!isPortrait) {
        bottom.appendChild(this.buildReplayBar());
      }
    } else {
      bottom.innerHTML = `
        <div class="sf-super-meter-wrap">
          <div class="sf-super-label" id="sf-super-label">SUPER GAUGE: 0%</div>
          <div class="sf-super-track"><div class="sf-super-fill" id="sf-super-fill" style="width:0%;"></div></div>
        </div>
      `;
    }
    hud.appendChild(bottom);

    this.uiLayerEl.appendChild(hud);
    this.syncHudPortraitFrames();

    // Cache live HUD refs
    this.p1HpFillEl = hud.querySelector('#sf-p1-fill');
    this.p1HpTrailEl = hud.querySelector('#sf-p1-trail');
    this.p2HpFillEl = hud.querySelector('#sf-p2-fill');
    this.p2HpTrailEl = hud.querySelector('#sf-p2-trail');
    this.p1GuardFillEl = hud.querySelector('#sf-p1-guard-fill');
    this.p2GuardFillEl = hud.querySelector('#sf-p2-guard-fill');
    this.p1FsmTagEl = hud.querySelector('#sf-p1-fsm');
    this.p2FsmTagEl = hud.querySelector('#sf-p2-fsm');
    this.timerNumEl = hud.querySelector('#sf-timer-num');
    this.roundTagEl = hud.querySelector('#sf-round-tag');
    this.pingTagEl = hud.querySelector('#sf-ping-tag');
    this.bannerWrapEl = hud.querySelector('#sf-banner-wrap');
    this.superFillEl = hud.querySelector('#sf-super-fill');
    this.superLabelEl = hud.querySelector('#sf-super-label');
    this.comboEl = hud.querySelector('#sf-p1-combo');
    this.p1PipsEl = hud.querySelector('#sf-p1-pips');
    this.p2PipsEl = hud.querySelector('#sf-p2-pips');

    if (isPortrait) {
      this.renderPortraitDeck(utils, isReplay);
    } else if (!isReplay && this.showTouchControls && this.screen === 'playing') {
      const layer = document.createElement('div');
      layer.className = 'sf-touch-layer';
      this.buildTouchControlsInto(layer);
      this.uiLayerEl.appendChild(layer);
    }
    this.syncHudRefs();
  }

  private buildReplayBar(): HTMLDivElement {
    const bar = document.createElement('div');
    bar.className = 'sf-replay-bar';
    bar.id = 'sf-replay-bar';

    const progressRow = document.createElement('div');
    progressRow.className = 'sf-replay-progress-row';
    progressRow.innerHTML = `
      <div class="sf-replay-track"><div class="sf-replay-fill" id="sf-replay-progress-fill"></div></div>
      <div class="sf-replay-time" id="sf-replay-time">0.0S · 1.00X</div>
    `;
    bar.appendChild(progressRow);

    const actions = document.createElement('div');
    actions.className = 'sf-replay-actions';

    const playPauseBtn = document.createElement('button');
    playPauseBtn.className = 'sf-btn sf-btn-compact sf-btn-primary';
    playPauseBtn.id = 'sf-replay-playpause';
    playPauseBtn.textContent = 'JEDA';
    playPauseBtn.addEventListener('click', (e) => {
      e.currentTarget && (e.currentTarget as HTMLElement).blur();
      this.toggleReplayPlaybackPause();
    });

    const speedBtn = document.createElement('button');
    speedBtn.className = 'sf-btn sf-btn-compact';
    speedBtn.id = 'sf-replay-speed';
    speedBtn.textContent = 'KEC: 1X';
    speedBtn.addEventListener('click', (e) => {
      e.currentTarget && (e.currentTarget as HTMLElement).blur();
      this.cycleReplayPlaybackSpeed();
    });

    const restartBtn = document.createElement('button');
    restartBtn.className = 'sf-btn sf-btn-compact';
    restartBtn.id = 'sf-replay-restart';
    restartBtn.textContent = 'ULANGI';
    restartBtn.addEventListener('click', (e) => {
      e.currentTarget && (e.currentTarget as HTMLElement).blur();
      this.restartReplay();
    });

    const exitBtn = document.createElement('button');
    exitBtn.className = 'sf-btn sf-btn-compact';
    exitBtn.id = 'sf-replay-exit';
    exitBtn.textContent = 'KELUAR';
    exitBtn.addEventListener('click', (e) => {
      e.currentTarget && (e.currentTarget as HTMLElement).blur();
      this.audio.playUiClick(false);
      this.exitReplay();
    });

    actions.appendChild(playPauseBtn);
    actions.appendChild(speedBtn);
    actions.appendChild(restartBtn);
    actions.appendChild(exitBtn);
    bar.appendChild(actions);

    this.replayProgressFillEl = progressRow.querySelector('#sf-replay-progress-fill');
    this.replayTimeEl = progressRow.querySelector('#sf-replay-time');
    this.replayPlayPauseBtnEl = playPauseBtn;
    this.replaySpeedBtnEl = speedBtn;

    return bar;
  }

  private renderPortraitDeck(utilsEl?: HTMLDivElement, isReplay = false): void {
    this.portraitDeckEl.innerHTML = '';

    const topRow = document.createElement('div');
    topRow.className = 'sf-portrait-deck-top';
    if (isReplay) {
      topRow.innerHTML = `
        <div class="sf-super-meter-wrap" style="text-align:left;">
          <div class="sf-super-label" style="margin-bottom:0;">MODE REPLAY · SLOW-MO OTOMATIS HIT BESAR &amp; K.O.</div>
        </div>
      `;
    } else {
      topRow.innerHTML = `
        <div class="sf-super-meter-wrap">
          <div class="sf-super-label" id="sf-deck-super-label">SUPER GAUGE: 0%</div>
          <div class="sf-super-track"><div class="sf-super-fill" id="sf-deck-super-fill" style="width:0%;"></div></div>
        </div>
      `;
    }
    if (utilsEl) {
      utilsEl.className = 'sf-portrait-deck-utils';
      topRow.appendChild(utilsEl);
    }
    this.portraitDeckEl.appendChild(topRow);
    if (!isReplay) {
      this.superLabelEl = topRow.querySelector('#sf-deck-super-label');
      this.superFillEl = topRow.querySelector('#sf-deck-super-fill');
    }

    const controlsRow = document.createElement('div');
    controlsRow.className = 'sf-portrait-deck-controls';
    if (isReplay) {
      controlsRow.appendChild(this.buildReplayBar());
    } else {
      if (this.screen !== 'playing') {
        controlsRow.style.opacity = '0.42';
        controlsRow.style.pointerEvents = 'none';
      }

      if (this.showTouchControls) {
        this.buildTouchControlsInto(controlsRow);
      } else {
        const offNote = document.createElement('div');
        offNote.className = 'sf-mono';
        offNote.style.cssText =
          'width:100%;text-align:center;font-size:11px;font-weight:700;letter-spacing:0.08em;padding:24px 0;opacity:0.7;';
        offNote.textContent = 'VIRTUAL PAD NONAKTIF · TEKAN [PAD: OFF] UNTUK MENGAKTIFKAN';
        controlsRow.appendChild(offNote);
      }
    }
    this.portraitDeckEl.appendChild(controlsRow);

    const foot = document.createElement('div');
    foot.className = 'sf-portrait-deck-foot';
    foot.innerHTML = isReplay
      ? `<span>REPLAY SLOW-MO DECK</span><span>TIMESCALE OTOMATIS</span>`
      : `<span>3D TACTILE CONSOLE PAD</span><span>GESER STICK · TEKAN AKSI</span>`;
    this.portraitDeckEl.appendChild(foot);
  }

  private buildTouchControlsInto(container: HTMLElement): void {
    // Virtual Analog Joystick (360 degrees, circular 3D pad)
    const joyZone = document.createElement('div');
    joyZone.className = 'sf-joystick-zone';
    joyZone.setAttribute('aria-label', 'Virtual Analog Joystick');
    joyZone.innerHTML = `
      <div class="sf-joystick-base-3d"></div>
      <div class="sf-joystick-plate">
        <div class="sf-joystick-cross"></div>
      </div>
      <div class="sf-joystick-knob">
        <div class="sf-knob-shadow"></div>
        <div class="sf-knob-cap"></div>
      </div>
    `;
    const knob = joyZone.querySelector('.sf-joystick-knob') as HTMLDivElement;

    const updateStick = (clientX: number, clientY: number) => {
      const rect = joyZone.getBoundingClientRect();
      const cx = rect.left + rect.width * 0.5;
      const cy = rect.top + rect.height * 0.5;
      const maxR = rect.width * 0.35;
      const dx = clientX - cx;
      const dy = clientY - cy;
      const dist = Math.hypot(dx, dy);
      const clampedDist = Math.min(maxR, dist);
      const angle = Math.atan2(dy, dx);
      const kx = Math.cos(angle) * clampedDist;
      const ky = Math.sin(angle) * clampedDist;
      knob.style.transform = `translate(${kx.toFixed(1)}px, ${ky.toFixed(1)}px)`;

      const normX = dist > 10 ? kx / maxR : 0;
      const normY = dist > 10 ? -ky / maxR : 0; // Up is positive
      this.joyVec.x = Math.max(-1, Math.min(1, normX));
      this.joyVec.y = Math.max(-1, Math.min(1, normY));
    };

    const resetStick = () => {
      this.joyPointerId = null;
      this.joyVec.x = 0;
      this.joyVec.y = 0;
      joyZone.classList.remove('pressed');
      knob.style.transform = 'translate(0px, 0px)';
    };

    joyZone.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.joyPointerId !== null) return;
      this.joyPointerId = e.pointerId;
      joyZone.classList.add('pressed');
      joyZone.setPointerCapture(e.pointerId);
      updateStick(e.clientX, e.clientY);
    });
    joyZone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== this.joyPointerId) return;
      updateStick(e.clientX, e.clientY);
    });
    joyZone.addEventListener('pointerup', (e) => {
      if (e.pointerId === this.joyPointerId) resetStick();
    });
    joyZone.addEventListener('pointercancel', (e) => {
      if (e.pointerId === this.joyPointerId) resetStick();
    });

    // Action Buttons (Right Bottom)
    const btns = document.createElement('div');
    btns.className = 'sf-touch-buttons';

    const makeActionBtn = (
      label: string,
      sub: string,
      key: 'punch' | 'kick' | 'sp' | 'block' | 'super'
    ): HTMLButtonElement => {
      const b = document.createElement('button');
      b.className = 'sf-tbtn';
      b.innerHTML = `<span class="sf-tbtn-shadow"></span><span class="sf-tbtn-face"><span class="sf-tbtn-inner"><span class="sf-tbtn-main">${label}</span><span class="sf-tbtn-sub">${sub}</span></span></span>`;
      b.setAttribute('aria-label', label);
      const activePointers = new Set<number>();

      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        activePointers.add(e.pointerId);
        b.setPointerCapture(e.pointerId);
        b.classList.add('active');
        this.touchHeld[key] = true;
        if (key !== 'block') {
          this.queuedPresses[key] = true;
        }
      });
      const release = (e: PointerEvent) => {
        activePointers.delete(e.pointerId);
        if (activePointers.size === 0) {
          b.classList.remove('active');
          this.touchHeld[key] = false;
        }
      };
      b.addEventListener('pointerup', release);
      b.addEventListener('pointercancel', release);
      return b;
    };

    const btnBlock = makeActionBtn('BLOCK', 'TANGKIS', 'block');
    const btnPunch = makeActionBtn('PUNCH', 'PUKUL', 'punch');
    const btnKick = makeActionBtn('KICK', 'TENDANG', 'kick');
    const btnSp = makeActionBtn('SP', 'SENJATA', 'sp');
    const btnSuper = makeActionBtn('SUPER', 'ULTRA', 'super');
    btnSuper.style.gridColumn = 'span 2';
    this.superTouchBtnEl = btnSuper;

    btns.appendChild(btnPunch);
    btns.appendChild(btnKick);
    btns.appendChild(btnSp);
    btns.appendChild(btnBlock);
    btns.appendChild(btnSuper);

    container.appendChild(joyZone);
    container.appendChild(btns);
  }

  private renderPauseModal(): void {
    const isOnline = this.mode === 'online_1v1';
    const backdrop = document.createElement('div');
    backdrop.className = 'sf-modal-backdrop';
    const card = document.createElement('div');
    card.className = 'sf-modal-card';
    card.innerHTML = `
      <div class="sf-index-badge" style="justify-content:center;margin-bottom:6px;"><span class="sf-red-pip"></span><span>SYSTEM PAUSE</span></div>
      <h2 class="sf-modal-title">${
        isOnline ? 'MENU PERTANDINGAN ONLINE' : 'PERMAINAN DIJEDA'
      }</h2>
    `;

    const stack = document.createElement('div');
    stack.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

    const resumeBtn = document.createElement('button');
    resumeBtn.className = 'sf-btn sf-btn-primary';
    resumeBtn.textContent = 'LANJUTKAN';
    resumeBtn.addEventListener('click', () => this.resumeGame());
    stack.appendChild(resumeBtn);

    const settingsBtn = document.createElement('button');
    settingsBtn.className = 'sf-btn';
    settingsBtn.id = 'sf-btn-open-settings';
    settingsBtn.textContent = 'PENGATURAN';
    settingsBtn.addEventListener('click', () => this.openSettingsModal());
    stack.appendChild(settingsBtn);

    if (!isOnline) {
      if (this.replayRecorder && this.replayRecorder.frames.length > 15) {
        const replayBtn = document.createElement('button');
        replayBtn.className = 'sf-btn';
        replayBtn.id = 'sf-pause-replay-btn';
        replayBtn.textContent = 'PUTAR REPLAY SEJAUH INI';
        replayBtn.addEventListener('click', () => {
          this.audio.playUiClick(true);
          this.startReplay('paused');
        });
        stack.appendChild(replayBtn);
      }

      const restartBtn = document.createElement('button');
      restartBtn.className = 'sf-btn';
      restartBtn.textContent = 'ULANGI PERTARUNGAN';
      restartBtn.addEventListener('click', () => this.startMatch());

      const charBtn = document.createElement('button');
      charBtn.className = 'sf-btn';
      charBtn.textContent = 'GANTI KARAKTER & ARENA';
      charBtn.addEventListener('click', () => this.setScreen('char_stage_select'));

      stack.appendChild(restartBtn);
      stack.appendChild(charBtn);
    }

    const titleBtn = document.createElement('button');
    titleBtn.className = 'sf-btn';
    titleBtn.textContent = isOnline ? 'PUTUSKAN & KE MENU UTAMA' : 'MENU UTAMA';
    titleBtn.addEventListener('click', () => {
      if (isOnline) this.leaveOnlineToMenu('title');
      else this.setScreen('title');
    });

    stack.appendChild(titleBtn);
    card.appendChild(stack);
    backdrop.appendChild(card);
    this.uiLayerEl.appendChild(backdrop);
  }

  private renderDisconnectModal(): void {
    const backdrop = document.createElement('div');
    backdrop.className = 'sf-modal-backdrop';
    const card = document.createElement('div');
    card.className = 'sf-modal-card';
    card.innerHTML = `
      <div class="sf-index-badge" style="justify-content:center;margin-bottom:6px;"><span class="sf-red-pip"></span><span>KONEKSI ONLINE 1V1</span></div>
      <h2 class="sf-modal-title" style="margin-bottom:8px;">LAWAN TERPUTUS</h2>
      <p class="sf-modal-copy">
        Perangkat lawan meninggalkan room atau koneksi internet terputus.
      </p>
    `;

    const backBtn = document.createElement('button');
    backBtn.className = 'sf-btn sf-btn-primary';
    backBtn.style.width = '100%';
    backBtn.textContent = 'KEMBALI KE MENU UTAMA';
    backBtn.addEventListener('click', () => {
      this.audio.playUiClick(false);
      this.leaveOnlineToMenu('title');
    });

    card.appendChild(backBtn);
    backdrop.appendChild(card);
    this.uiLayerEl.appendChild(backdrop);
  }

  private renderGameOverModal(): void {
    if (!this.matchState) return;
    this.recordCompletedOnlineMatchIfNeeded();
    const m = this.matchState;
    const isOnline = m.mode === 'online_1v1';
    const localSlot: 1 | 2 = isOnline && this.onlineRole === 'guest' ? 2 : 1;
    const localFighter = localSlot === 1 ? m.p1 : m.p2;
    const playerWon = m.winnerSlot === localSlot;
    const winnerName =
      m.winnerSlot === 1
        ? this.getSlotCharacterName(1, m.p1.charId)
        : this.getSlotCharacterName(2, m.p2.charId);

    const backdrop = document.createElement('div');
    backdrop.className = 'sf-modal-backdrop';
    const card = document.createElement('div');
    card.className = 'sf-modal-card';
    card.innerHTML = `
      <div class="sf-index-badge" style="justify-content:center;margin-bottom:6px;"><span class="sf-red-pip"></span><span>HASIL PERTARUNGAN · BEST OF 3</span></div>
      <h2 class="sf-modal-title" style="margin-bottom:4px;">${playerWon ? 'KAMU MENANG!' : 'KALAH!'}</h2>
      <div class="sf-modal-sub" id="sf-gameover-winner"></div>
      <div class="sf-stats-grid">
        <div class="sf-stat-tile"><div class="sf-stat-k">01 · SKOR RONDE</div><div class="sf-stat-v">${m.p1.roundsWon} - ${m.p2.roundsWon}</div></div>
        <div class="sf-stat-tile"><div class="sf-stat-k">02 · MAX COMBO ${localSlot}P</div><div class="sf-stat-v">${localFighter.maxComboAchieved} HITS</div></div>
        <div class="sf-stat-tile"><div class="sf-stat-k">03 · DAMAGE ${localSlot}P</div><div class="sf-stat-v">${Math.round(localFighter.totalDamageDealt)}</div></div>
        <div class="sf-stat-tile"><div class="sf-stat-k">04 · DURASI</div><div class="sf-stat-v">${Math.round(m.matchTimeElapsed)}S</div></div>
      </div>
    `;
    const winnerSubEl = card.querySelector('#sf-gameover-winner');
    if (winnerSubEl) winnerSubEl.textContent = `PEMENANG: ${winnerName}`;

    const actions = document.createElement('div');
    actions.style.cssText = 'display:flex;flex-direction:column;gap:8px;';

    const rematchBtn = document.createElement('button');
    rematchBtn.className = 'sf-btn sf-btn-primary';
    rematchBtn.id = 'sf-online-rematch-btn';
    rematchBtn.dataset.start = 'true';
    rematchBtn.textContent =
      isOnline && this.onlineRole === 'host' && this.onlineRematchPending
        ? 'REMATCH (LAWAN SIAP!)'
        : 'REMATCH';
    rematchBtn.addEventListener('click', () => {
      this.audio.playUiClick(true);
      if (isOnline) {
        if (this.onlineRole === 'host') {
          this.sendMatchStartToGuest();
          this.startMatch();
        } else {
          this.onlineRematchPending = true;
          this.peerSession.sendReliable({ t: 'rematch_req' });
          rematchBtn.textContent = 'MENUNGGU HOST REMATCH...';
          rematchBtn.disabled = true;
        }
      } else {
        this.startMatch();
      }
    });
    actions.appendChild(rematchBtn);

    if (!isOnline) {
      if (this.replayRecorder && this.replayRecorder.frames.length > 0) {
        const replayBtn = document.createElement('button');
        replayBtn.className = 'sf-btn';
        replayBtn.id = 'sf-gameover-replay-btn';
        replayBtn.textContent = 'TONTON REPLAY';
        replayBtn.addEventListener('click', () => {
          this.audio.playUiClick(true);
          this.startReplay('gameover');
        });
        actions.appendChild(replayBtn);
      }

      const changeBtn = document.createElement('button');
      changeBtn.className = 'sf-btn';
      changeBtn.textContent = 'GANTI KARAKTER & ARENA';
      changeBtn.addEventListener('click', () => {
        this.audio.playUiClick(false);
        this.setScreen('char_stage_select');
      });
      actions.appendChild(changeBtn);
    }

    const titleBtn = document.createElement('button');
    titleBtn.className = 'sf-btn';
    titleBtn.textContent = 'MENU UTAMA';
    titleBtn.addEventListener('click', () => {
      this.audio.playUiClick(false);
      if (isOnline) this.leaveOnlineToMenu('title');
      else this.setScreen('title');
    });

    actions.appendChild(titleBtn);
    card.appendChild(actions);
    backdrop.appendChild(card);
    this.uiLayerEl.appendChild(backdrop);
  }

  private updateUtilityLabels(): void {
    const muteBtn = document.getElementById('sf-btn-mute');
    if (muteBtn) muteBtn.textContent = this.audio.isMuted() ? 'MUTE' : 'SFX';
  }

  private openAuthModal(tab: 'login' | 'register' | 'reset' = 'login'): void {
    this.audio.playUiClick(false);
    this.showAuthModal = true;
    this.authTab = tab;
    this.authAlert = null;
    this.authBusy = false;
    this.renderUI();
  }

  private renderAuthModal(): void {
    const backdrop = document.createElement('div');
    backdrop.className = 'sf-modal-backdrop sf-settings-backdrop';

    const card = document.createElement('div');
    card.className = 'sf-modal-card sf-settings-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'sf-auth-title');

    const headBadge = document.createElement('div');
    headBadge.className = 'sf-index-badge';
    headBadge.style.cssText = 'justify-content:center;margin-bottom:6px;';
    headBadge.innerHTML = `<span class="sf-red-pip"></span><span>AKUN KELUARGA · CLOUD SYNC</span>`;
    card.appendChild(headBadge);

    const titleEl = document.createElement('h2');
    titleEl.className = 'sf-modal-title';
    titleEl.id = 'sf-auth-title';
    titleEl.textContent =
      this.authTab === 'login'
        ? 'LOGIN AKUN'
        : this.authTab === 'register'
          ? 'DAFTAR AKUN BARU'
          : 'LUPA PASSWORD';
    card.appendChild(titleEl);

    const tabsRow = document.createElement('div');
    tabsRow.className = 'sf-tabs-row';
    tabsRow.setAttribute('role', 'tablist');
    const tabItems: Array<{ id: 'login' | 'register' | 'reset'; label: string }> = [
      { id: 'login', label: 'MASUK' },
      { id: 'register', label: 'DAFTAR' },
      { id: 'reset', label: 'LUPA PASSWORD' },
    ];
    for (const item of tabItems) {
      const tBtn = document.createElement('button');
      tBtn.type = 'button';
      tBtn.className = 'sf-tab-btn';
      tBtn.setAttribute('role', 'tab');
      tBtn.setAttribute('aria-selected', String(this.authTab === item.id));
      tBtn.textContent = item.label;
      tBtn.addEventListener('click', () => {
        this.audio.playUiClick(false);
        this.authTab = item.id;
        this.authAlert = null;
        this.renderUI();
      });
      tabsRow.appendChild(tBtn);
    }
    card.appendChild(tabsRow);

    if (this.authAlert) {
      const alertBox = document.createElement('div');
      alertBox.className = `sf-form-alert ${this.authAlert.type === 'error' ? 'is-error' : 'is-success'}`;
      alertBox.style.marginBottom = '10px';
      alertBox.textContent = this.authAlert.text;
      card.appendChild(alertBox);
    }

    const form = document.createElement('form');
    form.className = 'sf-form-stack';

    const emailGroup = document.createElement('div');
    emailGroup.className = 'sf-field-group';
    const emailLabel = document.createElement('label');
    emailLabel.className = 'sf-field-label';
    emailLabel.htmlFor = 'sf-auth-email';
    emailLabel.textContent = 'EMAIL';
    const emailInput = document.createElement('input');
    emailInput.type = 'email';
    emailInput.id = 'sf-auth-email';
    emailInput.className = 'sf-text-input';
    emailInput.placeholder = 'nama@email.com';
    emailInput.required = true;
    emailInput.value = this.authEmailInput;
    emailInput.addEventListener('input', () => {
      this.authEmailInput = emailInput.value;
    });
    emailGroup.appendChild(emailLabel);
    emailGroup.appendChild(emailInput);
    form.appendChild(emailGroup);

    let passInput: HTMLInputElement | null = null;
    let passConfirmInput: HTMLInputElement | null = null;

    if (this.authTab !== 'reset') {
      const passGroup = document.createElement('div');
      passGroup.className = 'sf-field-group';
      const passLabel = document.createElement('label');
      passLabel.className = 'sf-field-label';
      passLabel.htmlFor = 'sf-auth-password';
      passLabel.textContent = 'PASSWORD';
      passInput = document.createElement('input');
      passInput.type = 'password';
      passInput.id = 'sf-auth-password';
      passInput.className = 'sf-text-input';
      passInput.placeholder = 'Minimal 6 karakter';
      passInput.required = true;
      passInput.minLength = 6;
      passInput.value = this.authPassInput;
      passInput.addEventListener('input', () => {
        this.authPassInput = passInput!.value;
      });
      passGroup.appendChild(passLabel);
      passGroup.appendChild(passInput);
      form.appendChild(passGroup);
    }

    if (this.authTab === 'register') {
      const confirmGroup = document.createElement('div');
      confirmGroup.className = 'sf-field-group';
      const confirmLabel = document.createElement('label');
      confirmLabel.className = 'sf-field-label';
      confirmLabel.htmlFor = 'sf-auth-password-confirm';
      confirmLabel.textContent = 'ULANGI PASSWORD';
      passConfirmInput = document.createElement('input');
      passConfirmInput.type = 'password';
      passConfirmInput.id = 'sf-auth-password-confirm';
      passConfirmInput.className = 'sf-text-input';
      passConfirmInput.placeholder = 'Ketik ulang password';
      passConfirmInput.required = true;
      passConfirmInput.minLength = 6;
      passConfirmInput.value = this.authPassConfirmInput;
      passConfirmInput.addEventListener('input', () => {
        this.authPassConfirmInput = passConfirmInput!.value;
      });
      confirmGroup.appendChild(confirmLabel);
      confirmGroup.appendChild(passConfirmInput);
      form.appendChild(confirmGroup);
    }

    if (this.authTab === 'reset') {
      const resetHint = document.createElement('p');
      resetHint.className = 'sf-settings-hint';
      resetHint.textContent =
        'Masukkan email akun yang terdaftar. Tautan pemulihan password akan dikirim melalui Firebase Authentication.';
      form.appendChild(resetHint);
    }

    const submitBtn = document.createElement('button');
    submitBtn.type = 'submit';
    submitBtn.className = 'sf-btn sf-btn-primary';
    submitBtn.id = 'sf-auth-submit-btn';
    submitBtn.disabled = this.authBusy;
    submitBtn.textContent = this.authBusy
      ? 'MEMPROSES...'
      : this.authTab === 'login'
        ? 'MASUK SEKARANG'
        : this.authTab === 'register'
          ? 'DAFTAR AKUN'
          : 'KIRIM TAUTAN RESET';
    form.appendChild(submitBtn);

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (this.authBusy) return;
      const cleanEmail = this.authEmailInput.trim();
      if (!cleanEmail) {
        this.authAlert = { type: 'error', text: 'Email wajib diisi.' };
        this.renderUI();
        return;
      }

      if (this.authTab === 'reset') {
        this.authBusy = true;
        this.authAlert = null;
        this.renderUI();
        try {
          await sendPasswordReset(cleanEmail);
          this.authBusy = false;
          this.authAlert = {
            type: 'success',
            text: `Tautan pemulihan password telah dikirim ke ${cleanEmail}. Periksa kotak masuk atau folder Spam.`,
          };
          this.renderUI();
        } catch (err) {
          this.authBusy = false;
          this.authAlert = { type: 'error', text: mapFirebaseAuthError(err) };
          this.renderUI();
        }
        return;
      }

      if (this.authPassInput.length < 6) {
        this.authAlert = { type: 'error', text: 'Password minimal 6 karakter.' };
        this.renderUI();
        return;
      }

      if (this.authTab === 'register' && this.authPassInput !== this.authPassConfirmInput) {
        this.authAlert = { type: 'error', text: 'Konfirmasi password tidak cocok.' };
        this.renderUI();
        return;
      }

      this.authBusy = true;
      this.authAlert = null;
      this.renderUI();
      try {
        if (this.authTab === 'login') {
          await loginWithEmail(cleanEmail, this.authPassInput);
        } else {
          await registerWithEmail(cleanEmail, this.authPassInput);
        }
        this.authBusy = false;
        this.showAuthModal = false;
        this.authPassInput = '';
        this.authPassConfirmInput = '';
        this.authAlert = null;
        this.renderUI();
      } catch (err) {
        this.authBusy = false;
        const blocked = Boolean((err as { isBlocked?: boolean } | null)?.isBlocked);
        if (blocked) {
          this.showAuthModal = false;
          this.blockedAlertEmail = cleanEmail;
          this.renderUI();
        } else {
          this.authAlert = { type: 'error', text: mapFirebaseAuthError(err) };
          this.renderUI();
        }
      }
    });

    card.appendChild(form);

    const footerRow = document.createElement('div');
    footerRow.style.cssText = 'display:flex;gap:8px;margin-top:12px;';

    if (this.authTab === 'login') {
      const forgotBtn = document.createElement('button');
      forgotBtn.type = 'button';
      forgotBtn.className = 'sf-btn sf-btn-compact';
      forgotBtn.style.flex = '1';
      forgotBtn.textContent = 'LUPA PASSWORD?';
      forgotBtn.addEventListener('click', () => {
        this.audio.playUiClick(false);
        this.authTab = 'reset';
        this.authAlert = null;
        this.renderUI();
      });
      footerRow.appendChild(forgotBtn);
    }

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'sf-btn sf-btn-compact';
    cancelBtn.style.flex = '1';
    cancelBtn.textContent = 'LANJUT SEBAGAI GUEST';
    cancelBtn.addEventListener('click', () => {
      this.audio.playUiClick(false);
      this.showAuthModal = false;
      this.renderUI();
    });
    footerRow.appendChild(cancelBtn);
    card.appendChild(footerRow);

    backdrop.appendChild(card);
    this.uiLayerEl.appendChild(backdrop);
  }

  private renderBlockedAlertModal(): void {
    const backdrop = document.createElement('div');
    backdrop.className = 'sf-modal-backdrop sf-settings-backdrop';
    backdrop.style.zIndex = '60';

    const card = document.createElement('div');
    card.className = 'sf-modal-card';
    card.setAttribute('role', 'alertdialog');
    card.setAttribute('aria-modal', 'true');

    const badge = document.createElement('div');
    badge.className = 'sf-index-badge';
    badge.style.cssText = 'justify-content:center;margin-bottom:8px;';
    badge.innerHTML = `<span class="sf-red-pip"></span><span>AKSES DITOLAK</span>`;

    const title = document.createElement('h2');
    title.className = 'sf-modal-title';
    title.textContent = 'AKUN DIBLOKIR';

    const copy = document.createElement('p');
    copy.className = 'sf-modal-copy';
    copy.textContent = `Akun "${this.blockedAlertEmail || ''}" telah diblokir oleh Administrator (${ADMIN_EMAIL}). Anda telah dikeluarkan secara otomatis. Hubungi admin jika membutuhkan pembukaan blokir.`;

    const closeBtn = document.createElement('button');
    closeBtn.className = 'sf-btn sf-btn-primary';
    closeBtn.style.width = '100%';
    closeBtn.textContent = 'MENGERTI';
    closeBtn.addEventListener('click', () => {
      this.audio.playUiClick(false);
      this.blockedAlertEmail = null;
      this.renderUI();
    });

    card.appendChild(badge);
    card.appendChild(title);
    card.appendChild(copy);
    card.appendChild(closeBtn);
    backdrop.appendChild(card);
    this.uiLayerEl.appendChild(backdrop);
  }

  private loadEditCharDraft(charId: CharacterId): void {
    const custom = this.authSession?.customCharacters || null;
    this.editCharSelected = charId;
    this.editCharNameInput = getEffectiveCharacterName(charId, custom);
    this.editCharFacePreview = getCustomFaceOverride(charId, custom);
    this.editCharAlert = null;
    this.cropImg = null;
    this.cropZoomFactor = 1;
    this.cropBaseScale = 1;
    this.cropTransform = { scale: 1, offsetX: 0, offsetY: 0, rotationDeg: 0 };
  }

  private openEditCharsModal(): void {
    if (!this.authSession) {
      this.openAuthModal('login');
      return;
    }
    this.audio.playUiClick(false);
    this.showEditCharsModal = true;
    this.loadEditCharDraft(this.editCharSelected || 'adnan');
    this.renderUI();
  }

  private loadCropImageFromUrl(url: string, isNewUpload: boolean): void {
    const img = new Image();
    img.onload = () => {
      this.cropImg = img;
      const cw = 240;
      const ch = 300;
      this.cropBaseScale = computeCoverFitScale(img.naturalWidth, img.naturalHeight, cw * 0.92, ch * 0.94);
      this.cropZoomFactor = 1;
      this.cropTransform = {
        scale: this.cropBaseScale,
        offsetX: 0,
        offsetY: 0,
        rotationDeg: 0,
      };
      if (isNewUpload) {
        this.editCharFacePreview = exportOvalCroppedFaceDataUrl(img, this.cropTransform, cw, ch);
      }
      const canvasEl = document.getElementById('sf-crop-canvas') as HTMLCanvasElement | null;
      if (canvasEl) {
        const ctx = canvasEl.getContext('2d');
        if (ctx) renderCropCanvasPreview(ctx, cw, ch, this.cropImg, this.cropTransform);
      }
      const sizeEl = document.getElementById('sf-crop-byte-info');
      if (sizeEl && this.editCharFacePreview) {
        const kb = (estimateDataUrlBytes(this.editCharFacePreview) / 1024).toFixed(1);
        sizeEl.textContent = `OUTPUT OVAL TRANSPARAN: 160x200 PX · ${kb} KB / ${(MAX_FACE_DATA_URL_BYTES / 1024).toFixed(0)} KB`;
      }
      const zoomSlider = document.getElementById('sf-crop-zoom-slider') as HTMLInputElement | null;
      if (zoomSlider) zoomSlider.value = '1';
      const zoomVal = document.getElementById('sf-crop-zoom-val');
      if (zoomVal) zoomVal.textContent = '1.0X';
      const tiltSlider = document.getElementById('sf-crop-tilt-slider') as HTMLInputElement | null;
      if (tiltSlider) tiltSlider.value = '0';
      const tiltVal = document.getElementById('sf-crop-tilt-val');
      if (tiltVal) tiltVal.textContent = '0°';
    };
    img.src = url;
  }

  private renderEditCharsModal(): void {
    if (!this.authSession) return;
    const customChars = this.authSession.customCharacters;

    const backdrop = document.createElement('div');
    backdrop.className = 'sf-modal-backdrop sf-settings-backdrop';

    const card = document.createElement('div');
    card.className = 'sf-modal-card sf-modal-wide';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'sf-edit-char-title');

    const badge = document.createElement('div');
    badge.className = 'sf-index-badge';
    badge.style.cssText = 'justify-content:center;margin-bottom:6px;';
    badge.innerHTML = `<span class="sf-red-pip"></span><span>KUSTOMISASI 4 KARAKTER KELUARGA</span>`;
    card.appendChild(badge);

    const title = document.createElement('h2');
    title.className = 'sf-modal-title';
    title.id = 'sf-edit-char-title';
    title.style.textAlign = 'center';
    title.textContent = 'EDIT KARAKTER & OVAL CROPPER';
    card.appendChild(title);

    // Character selector tabs (4 family slots)
    const charTabs = document.createElement('div');
    charTabs.className = 'sf-edit-char-tabs';
    for (const id of CHARACTER_ORDER) {
      const tab = document.createElement('button');
      tab.type = 'button';
      tab.className = 'sf-edit-char-tab';
      tab.setAttribute('aria-selected', String(this.editCharSelected === id));

      const thumb = document.createElement('div');
      thumb.className = 'sf-edit-char-thumb';
      const tImg = document.createElement('img');
      tImg.src = getEffectiveCharacterFaceSrc(id, customChars);
      tImg.alt = CHARACTERS[id].name;
      thumb.appendChild(tImg);

      const tLabel = document.createElement('span');
      tLabel.textContent = getEffectiveCharacterName(id, customChars).split(' ').slice(-1)[0];

      tab.appendChild(thumb);
      tab.appendChild(tLabel);
      tab.addEventListener('click', () => {
        this.audio.playUiClick(false);
        this.loadEditCharDraft(id);
        this.renderUI();
      });
      charTabs.appendChild(tab);
    }
    card.appendChild(charTabs);

    if (this.editCharAlert) {
      const alertBox = document.createElement('div');
      alertBox.className = `sf-form-alert ${this.editCharAlert.type === 'error' ? 'is-error' : 'is-success'}`;
      alertBox.style.marginBottom = '10px';
      alertBox.textContent = this.editCharAlert.text;
      card.appendChild(alertBox);
    }

    const editGrid = document.createElement('div');
    editGrid.className = 'sf-edit-grid';

    // Left: Precision Oval Face Cropper Canvas
    const cropStage = document.createElement('div');
    cropStage.className = 'sf-crop-stage';

    const cw = 240;
    const ch = 300;
    const canvas = document.createElement('canvas');
    canvas.id = 'sf-crop-canvas';
    canvas.className = 'sf-crop-canvas';
    canvas.width = cw;
    canvas.height = ch;

    const redrawCanvas = (updateExport = false) => {
      const ctx = canvas.getContext('2d');
      if (ctx) {
        renderCropCanvasPreview(ctx, cw, ch, this.cropImg, this.cropTransform);
      }
      if (updateExport && this.cropImg) {
        this.editCharFacePreview = exportOvalCroppedFaceDataUrl(
          this.cropImg,
          this.cropTransform,
          cw,
          ch
        );
        const sizeEl = document.getElementById('sf-crop-byte-info');
        if (sizeEl && this.editCharFacePreview) {
          const kb = (estimateDataUrlBytes(this.editCharFacePreview) / 1024).toFixed(1);
          sizeEl.textContent = `OUTPUT OVAL TRANSPARAN: 160x200 PX · ${kb} KB / ${(MAX_FACE_DATA_URL_BYTES / 1024).toFixed(0)} KB`;
        }
      }
    };

    let dragPointerId: number | null = null;
    let lastDragX = 0;
    let lastDragY = 0;

    canvas.addEventListener('pointerdown', (e) => {
      if (!this.cropImg) return;
      e.preventDefault();
      dragPointerId = e.pointerId;
      lastDragX = e.clientX;
      lastDragY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', (e) => {
      if (dragPointerId !== e.pointerId || !this.cropImg) return;
      const rect = canvas.getBoundingClientRect();
      const scaleX = cw / Math.max(1, rect.width);
      const scaleY = ch / Math.max(1, rect.height);
      this.cropTransform.offsetX += (e.clientX - lastDragX) * scaleX;
      this.cropTransform.offsetY += (e.clientY - lastDragY) * scaleY;
      lastDragX = e.clientX;
      lastDragY = e.clientY;
      redrawCanvas(false);
    });
    const endDrag = (e: PointerEvent) => {
      if (dragPointerId !== e.pointerId) return;
      dragPointerId = null;
      redrawCanvas(true);
    };
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointercancel', endDrag);

    canvas.addEventListener(
      'wheel',
      (e) => {
        if (!this.cropImg) return;
        e.preventDefault();
        const nextZoom = Math.max(
          0.5,
          Math.min(3.5, this.cropZoomFactor + (e.deltaY < 0 ? 0.1 : -0.1))
        );
        this.cropZoomFactor = nextZoom;
        this.cropTransform.scale = this.cropBaseScale * nextZoom;
        const slider = document.getElementById('sf-crop-zoom-slider') as HTMLInputElement | null;
        if (slider) slider.value = nextZoom.toFixed(2);
        const zTxt = document.getElementById('sf-crop-zoom-val');
        if (zTxt) zTxt.textContent = `${nextZoom.toFixed(1)}X`;
        redrawCanvas(true);
      },
      { passive: false }
    );

    cropStage.appendChild(canvas);

    const sliderRow = document.createElement('div');
    sliderRow.className = 'sf-crop-slider-row';
    const zoomLabel = document.createElement('label');
    zoomLabel.className = 'sf-crop-slider-label';
    zoomLabel.htmlFor = 'sf-crop-zoom-slider';
    zoomLabel.textContent = 'ZOOM';
    const zoomSlider = document.createElement('input');
    zoomSlider.type = 'range';
    zoomSlider.id = 'sf-crop-zoom-slider';
    zoomSlider.className = 'sf-crop-slider';
    zoomSlider.min = '0.5';
    zoomSlider.max = '3.5';
    zoomSlider.step = '0.05';
    zoomSlider.value = String(this.cropZoomFactor);
    zoomSlider.setAttribute('aria-label', 'Zoom Foto Wajah');
    const zoomVal = document.createElement('span');
    zoomVal.id = 'sf-crop-zoom-val';
    zoomVal.className = 'sf-crop-slider-val';
    zoomVal.textContent = `${this.cropZoomFactor.toFixed(1)}X`;
    zoomSlider.addEventListener('input', () => {
      this.cropZoomFactor = parseFloat(zoomSlider.value) || 1;
      this.cropTransform.scale = this.cropBaseScale * this.cropZoomFactor;
      zoomVal.textContent = `${this.cropZoomFactor.toFixed(1)}X`;
      redrawCanvas(true);
    });
    sliderRow.appendChild(zoomLabel);
    sliderRow.appendChild(zoomSlider);
    sliderRow.appendChild(zoomVal);
    cropStage.appendChild(sliderRow);

    const tiltRow = document.createElement('div');
    tiltRow.className = 'sf-crop-slider-row';
    const tiltLabel = document.createElement('label');
    tiltLabel.className = 'sf-crop-slider-label';
    tiltLabel.htmlFor = 'sf-crop-tilt-slider';
    tiltLabel.textContent = 'MIRING';
    const tiltSlider = document.createElement('input');
    tiltSlider.type = 'range';
    tiltSlider.id = 'sf-crop-tilt-slider';
    tiltSlider.className = 'sf-crop-slider';
    tiltSlider.min = String(MIN_CROP_ROTATION_DEG);
    tiltSlider.max = String(MAX_CROP_ROTATION_DEG);
    tiltSlider.step = '1';
    const initialTilt = clampCropRotationDeg(this.cropTransform.rotationDeg);
    tiltSlider.value = String(initialTilt);
    tiltSlider.setAttribute('aria-label', 'Kemiringan Kanan-Kiri Foto Wajah');
    const tiltVal = document.createElement('span');
    tiltVal.id = 'sf-crop-tilt-val';
    tiltVal.className = 'sf-crop-slider-val';
    tiltVal.title = 'Klik 2x slider untuk reset ke 0°';
    tiltVal.textContent = formatCropTiltLabel(initialTilt);
    tiltSlider.addEventListener('input', () => {
      const nextTilt = clampCropRotationDeg(parseFloat(tiltSlider.value));
      this.cropTransform.rotationDeg = nextTilt;
      tiltVal.textContent = formatCropTiltLabel(nextTilt);
      redrawCanvas(true);
    });
    tiltSlider.addEventListener('dblclick', () => {
      this.cropTransform.rotationDeg = 0;
      tiltSlider.value = '0';
      tiltVal.textContent = '0°';
      redrawCanvas(true);
    });
    tiltRow.appendChild(tiltLabel);
    tiltRow.appendChild(tiltSlider);
    tiltRow.appendChild(tiltVal);
    cropStage.appendChild(tiltRow);

    const byteInfo = document.createElement('div');
    byteInfo.id = 'sf-crop-byte-info';
    byteInfo.className = 'sf-crop-meta';
    if (this.editCharFacePreview) {
      const kb = (estimateDataUrlBytes(this.editCharFacePreview) / 1024).toFixed(1);
      byteInfo.textContent = `OUTPUT OVAL TRANSPARAN: 160x200 PX · ${kb} KB / ${(MAX_FACE_DATA_URL_BYTES / 1024).toFixed(0)} KB`;
    } else {
      byteInfo.textContent =
        'GESER FOTO & PAS-KAN GARIS MATA + HIDUNG DI DALAM BINGKAI OVAL (MAKS 160x200 PX)';
    }
    cropStage.appendChild(byteInfo);
    editGrid.appendChild(cropStage);

    // Right: Form Fields, File Upload & Actions
    const formCol = document.createElement('div');
    formCol.className = 'sf-form-stack';

    const nameGroup = document.createElement('div');
    nameGroup.className = 'sf-field-group';
    const nameLabel = document.createElement('label');
    nameLabel.className = 'sf-field-label';
    nameLabel.htmlFor = 'sf-edit-char-name';
    nameLabel.textContent = `NAMA KARAKTER (DEFAULT: ${CHARACTERS[this.editCharSelected].name})`;
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.id = 'sf-edit-char-name';
    nameInput.className = 'sf-text-input';
    nameInput.maxLength = MAX_CHARACTER_NAME_LEN;
    nameInput.value = this.editCharNameInput;
    nameInput.addEventListener('input', () => {
      this.editCharNameInput = nameInput.value;
    });
    nameGroup.appendChild(nameLabel);
    nameGroup.appendChild(nameInput);
    formCol.appendChild(nameGroup);

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.id = 'sf-edit-char-file';
    fileInput.className = 'sf-file-input-hidden';
    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          this.loadCropImageFromUrl(reader.result, true);
        }
      };
      reader.readAsDataURL(file);
    });
    formCol.appendChild(fileInput);

    const uploadBtn = document.createElement('button');
    uploadBtn.type = 'button';
    uploadBtn.className = 'sf-btn sf-btn-compact';
    uploadBtn.id = 'sf-edit-upload-btn';
    uploadBtn.textContent = 'PILIH FOTO WAJAH DARI GALERI';
    uploadBtn.addEventListener('click', () => {
      this.audio.playUiClick(false);
      fileInput.click();
    });
    formCol.appendChild(uploadBtn);

    const guideNote = document.createElement('p');
    guideNote.className = 'sf-settings-hint';
    guideNote.textContent =
      'Foto lama otomatis tertimpa & terhapus permanen di database. Jangan lupa aktifkan "GUNAKAN FOTO WAJAH" di Pengaturan agar tampil di 3D & HUD.';
    formCol.appendChild(guideNote);

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'sf-btn sf-btn-primary';
    saveBtn.id = 'sf-edit-save-btn';
    saveBtn.disabled = this.editCharBusy;
    saveBtn.textContent = this.editCharBusy ? 'MENYIMPAN...' : 'SIMPAN KARAKTER';
    saveBtn.addEventListener('click', async () => {
      if (!this.authSession || this.editCharBusy) return;
      const cleanName = sanitizeCharacterName(this.editCharNameInput);
      if (cleanName.length < 2) {
        this.editCharAlert = { type: 'error', text: 'Nama karakter minimal 2 huruf.' };
        this.renderUI();
        return;
      }

      let finalFace = this.editCharFacePreview;
      if (this.cropImg && this.cropImg.src.startsWith('data:')) {
        finalFace = exportOvalCroppedFaceDataUrl(this.cropImg, this.cropTransform, cw, ch);
      }

      this.editCharBusy = true;
      this.editCharAlert = null;
      this.renderUI();
      try {
        const saved = await saveCustomCharacterToDb(
          this.authSession.uid,
          this.editCharSelected,
          cleanName,
          finalFace
        );
        this.authSession.customCharacters = {
          ...this.authSession.customCharacters,
          [this.editCharSelected]: saved,
        };
        this.editCharBusy = false;
        this.editCharFacePreview = saved.faceBase64 ?? null;
        this.editCharAlert = {
          type: 'success',
          text: `${cleanName} berhasil disimpan ke akun!`,
        };
        this.syncRendererCustomFaces();
        this.renderUI();
      } catch (err) {
        this.editCharBusy = false;
        this.editCharAlert = {
          type: 'error',
          text: err instanceof Error ? err.message : 'Gagal menyimpan karakter.',
        };
        this.renderUI();
      }
    });
    formCol.appendChild(saveBtn);

    const resetBtn = document.createElement('button');
    resetBtn.type = 'button';
    resetBtn.className = 'sf-btn sf-btn-compact';
    resetBtn.disabled = this.editCharBusy;
    resetBtn.textContent = 'RESET KE DEFAULT';
    resetBtn.addEventListener('click', async () => {
      if (!this.authSession || this.editCharBusy) return;
      this.editCharBusy = true;
      this.editCharAlert = null;
      this.renderUI();
      try {
        await resetCustomCharacterInDb(this.authSession.uid, this.editCharSelected);
        const nextMap = { ...this.authSession.customCharacters };
        delete nextMap[this.editCharSelected];
        this.authSession.customCharacters = nextMap;
        this.editCharBusy = false;
        this.loadEditCharDraft(this.editCharSelected);
        this.editCharAlert = {
          type: 'success',
          text: `Karakter dikembalikan ke ${CHARACTERS[this.editCharSelected].name} default.`,
        };
        this.syncRendererCustomFaces();
        this.renderUI();
      } catch (err) {
        this.editCharBusy = false;
        this.editCharAlert = {
          type: 'error',
          text: err instanceof Error ? err.message : 'Gagal mereset karakter.',
        };
        this.renderUI();
      }
    });
    formCol.appendChild(resetBtn);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'sf-btn sf-btn-compact';
    closeBtn.textContent = 'TUTUP';
    closeBtn.addEventListener('click', () => {
      this.audio.playUiClick(false);
      this.showEditCharsModal = false;
      this.cropImg = null;
      this.renderUI();
    });
    formCol.appendChild(closeBtn);

    editGrid.appendChild(formCol);
    card.appendChild(editGrid);
    backdrop.appendChild(card);
    this.uiLayerEl.appendChild(backdrop);

    // Draw initial oval guide preview immediately and preload existing face asset
    redrawCanvas(false);
    if (!this.cropImg) {
      const initialSrc =
        this.editCharFacePreview || getEffectiveCharacterFaceSrc(this.editCharSelected, customChars);
      this.loadCropImageFromUrl(initialSrc, false);
    }
  }

  private openAdminModal(): void {
    if (!this.authSession?.isAdmin) return;
    this.audio.playUiClick(false);
    this.showAdminModal = true;
    this.adminTab = 'users';
    this.adminAlert = null;
    this.adminSearchQuery = '';
    this.adminRoomSearchQuery = '';
    this.adminSelectedUserUid = null;
    this.adminDraftBlocked = false;
    this.adminDraftChars = null;
    this.adminDetailSaving = false;
    this.peerSession.connectLobby();
    this.stopAdminSubscription();
    this.adminUnsub = subscribeAllUsersForAdmin(
      (users) => {
        this.adminUsers = users;
        if (!this.showAdminModal) return;
        if (this.adminSelectedUserUid || this.adminTab !== 'users') {
          const usersTabBtn = document.getElementById('sf-admin-tab-users');
          if (usersTabBtn) usersTabBtn.textContent = `DAFTAR USER (${users.length})`;
          return;
        }
        const searchFocused = document.activeElement?.id === 'sf-admin-search-input';
        if (searchFocused) {
          this.updateAdminUserListDom();
        } else {
          this.renderUI();
        }
      },
      (err) => {
        this.adminAlert = {
          type: 'error',
          text: err instanceof Error ? err.message : 'Gagal memuat daftar user dari database.',
        };
        if (this.showAdminModal) {
          this.renderUI();
        }
      }
    );
    this.renderUI();
  }

  private closeAdminModal(): void {
    this.showAdminModal = false;
    this.adminSelectedUserUid = null;
    this.adminDraftChars = null;
    this.adminAlert = null;
    this.stopAdminSubscription();
    this.renderUI();
  }

  private openAdminUserDetail(user: AdminUserRecord): void {
    this.audio.playUiClick(false);
    this.adminSelectedUserUid = user.uid;
    this.adminDraftBlocked = user.isBlocked;
    this.adminDraftChars = createAdminCharDraftMap(user.customCharacters);
    this.adminDetailSaving = false;
    this.adminAlert = null;
    this.renderUI();
  }

  private closeAdminUserDetail(): void {
    this.audio.playUiClick(false);
    this.adminSelectedUserUid = null;
    this.adminDraftChars = null;
    this.adminDetailSaving = false;
    this.adminAlert = null;
    this.renderUI();
  }

  private stopAdminSubscription(): void {
    if (this.adminUnsub) {
      try {
        this.adminUnsub();
      } catch {
        // ignore
      }
      this.adminUnsub = null;
    }
  }

  private updateAdminUserListDom(): void {
    const listEl = this.uiLayerEl.querySelector('#sf-admin-user-list') as HTMLDivElement | null;
    const countEl = this.uiLayerEl.querySelector('#sf-admin-user-count') as HTMLDivElement | null;
    if (!listEl) return;

    const filtered = filterAdminUsers(this.adminUsers, this.adminSearchQuery);
    if (countEl) {
      countEl.textContent = `${filtered.length} / ${this.adminUsers.length} USER`;
    }
    listEl.innerHTML = '';

    if (this.adminUsers.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'sf-active-rooms-empty';
      empty.textContent = 'MEMUAT DAFTAR USER TERDAFTAR...';
      listEl.appendChild(empty);
      return;
    }

    if (filtered.length === 0) {
      const noMatch = document.createElement('div');
      noMatch.className = 'sf-active-rooms-empty';
      noMatch.textContent = 'TIDAK ADA USER YANG COCOK DENGAN PENCARIAN EMAIL / UID.';
      listEl.appendChild(noMatch);
      return;
    }

    for (const user of filtered) {
      const isSelfAdmin = user.email.trim().toLowerCase() === ADMIN_EMAIL;
      const row = document.createElement('div');
      row.className = `sf-admin-row${user.isBlocked ? ' is-blocked' : ''}`;

      const info = document.createElement('div');
      info.style.minWidth = '0';

      const emailEl = document.createElement('div');
      emailEl.className = 'sf-admin-email';
      emailEl.textContent = user.email;

      const uidEl = document.createElement('div');
      uidEl.className = 'sf-admin-uid';
      uidEl.textContent = `UID: ${user.uid}`;

      const metaEl = document.createElement('div');
      metaEl.className = `sf-admin-meta ${user.isBlocked ? 'is-blocked' : 'is-ok'}`;
      metaEl.textContent = `${user.isBlocked ? 'DIBLOKIR' : 'AKTIF'} · ${user.customCount} KARAKTER KUSTOM · AKTIF: ${formatAdminTimestamp(
        user.lastSeen || user.createdAt
      )}`;

      info.appendChild(emailEl);
      info.appendChild(uidEl);
      info.appendChild(metaEl);
      row.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'sf-admin-row-actions';

      if (isSelfAdmin) {
        const selfBadge = document.createElement('span');
        selfBadge.className = 'sf-index-badge';
        selfBadge.innerHTML = `<span class="sf-red-pip"></span><span>ADMIN</span>`;
        actions.appendChild(selfBadge);
      }

      const detailBtn = document.createElement('button');
      detailBtn.type = 'button';
      detailBtn.className = 'sf-btn sf-btn-compact sf-btn-primary';
      detailBtn.textContent = 'LIHAT & EDIT DETAIL';
      detailBtn.addEventListener('click', () => {
        this.openAdminUserDetail(user);
      });
      actions.appendChild(detailBtn);

      row.appendChild(actions);
      listEl.appendChild(row);
    }
  }

  private updateAdminRoomListDom(): void {
    const listEl = this.uiLayerEl.querySelector('#sf-admin-room-list') as HTMLDivElement | null;
    const countEl = this.uiLayerEl.querySelector('#sf-admin-room-count') as HTMLDivElement | null;
    if (!listEl) return;

    const q = this.adminRoomSearchQuery.trim().toLowerCase();
    const filtered = !q
      ? this.onlineRooms
      : this.onlineRooms.filter(
          (r) =>
            r.name.toLowerCase().includes(q) ||
            r.id.toLowerCase().includes(q) ||
            (r.creatorName || '').toLowerCase().includes(q) ||
            (r.creatorUid || '').toLowerCase().includes(q)
        );

    if (countEl) {
      countEl.textContent = `${filtered.length} / ${this.onlineRooms.length} ROOM`;
    }
    listEl.innerHTML = '';

    if (this.onlineRooms.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'sf-active-rooms-empty';
      empty.textContent = 'BELUM ADA ROOM ONLINE ATAU RIWAYAT ROOM 7 HARI TERAKHIR.';
      listEl.appendChild(empty);
      return;
    }

    if (filtered.length === 0) {
      const noMatch = document.createElement('div');
      noMatch.className = 'sf-active-rooms-empty';
      noMatch.textContent = 'TIDAK ADA ROOM YANG COCOK DENGAN PENCARIAN.';
      listEl.appendChild(noMatch);
      return;
    }

    for (const room of filtered) {
      const row = document.createElement('div');
      row.className = `sf-admin-row${room.isOnline ? '' : ' is-blocked'}`;

      const info = document.createElement('div');
      info.style.minWidth = '0';

      const pill = document.createElement('div');
      pill.className = `sf-room-status-pill ${room.isOnline ? 'is-online' : 'is-offline'}`;
      pill.innerHTML = `<span class="sf-room-dot ${room.isOnline ? 'is-online' : 'is-offline'}"></span><span>${
        room.isOnline ? `ONLINE · ${room.playerCount}/2` : 'OFFLINE · RIWAYAT'
      }</span>`;

      const nameEl = document.createElement('div');
      nameEl.className = 'sf-admin-email';
      nameEl.textContent = `${room.name} (#${room.id})`;

      const creatorEl = document.createElement('div');
      creatorEl.className = 'sf-admin-uid';
      creatorEl.textContent = `PEMBUAT: ${room.creatorName || 'Guest'}${
        room.creatorUid ? ` · UID ${room.creatorUid}` : ''
      }`;

      const metaEl = document.createElement('div');
      metaEl.className = `sf-admin-meta ${room.isOnline ? 'is-ok' : 'is-blocked'}`;
      metaEl.textContent = `AKTIF TERAKHIR: ${formatAdminTimestamp(
        room.lastActive || room.createdAt
      )} (${formatRelativeRoomTime(room.lastActive || room.createdAt)})`;

      info.appendChild(pill);
      info.appendChild(nameEl);
      info.appendChild(creatorEl);
      info.appendChild(metaEl);
      row.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'sf-admin-row-actions';

      const delBtn = document.createElement('button');
      delBtn.type = 'button';
      delBtn.className = 'sf-btn sf-btn-compact sf-btn-danger';
      delBtn.dataset.adminDeleteRoomId = room.id;
      delBtn.textContent = 'HAPUS ROOM';
      delBtn.addEventListener('click', () => {
        this.requestDeleteOnlineRoom(room);
      });
      actions.appendChild(delBtn);

      row.appendChild(actions);
      listEl.appendChild(row);
    }
  }

  private renderAdminModal(): void {
    if (!this.authSession?.isAdmin) return;
    if (this.adminSelectedUserUid) {
      const targetUser = this.adminUsers.find((u) => u.uid === this.adminSelectedUserUid);
      if (targetUser) {
        this.renderAdminUserDetailModal(targetUser);
        return;
      }
      this.adminSelectedUserUid = null;
    }

    const backdrop = document.createElement('div');
    backdrop.className = 'sf-modal-backdrop sf-settings-backdrop';

    const card = document.createElement('div');
    card.className = 'sf-modal-card sf-modal-admin';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'sf-admin-title');

    const badge = document.createElement('div');
    badge.className = 'sf-index-badge';
    badge.style.cssText = 'justify-content:center;margin-bottom:6px;';
    badge.innerHTML = `<span class="sf-red-pip"></span><span>CREATOR ACCESS · ${ADMIN_EMAIL}</span>`;
    card.appendChild(badge);

    const title = document.createElement('h2');
    title.className = 'sf-modal-title';
    title.id = 'sf-admin-title';
    title.style.textAlign = 'center';
    title.textContent =
      this.adminTab === 'users'
        ? 'PANEL ADMIN · DAFTAR & INSPEKSI USER'
        : 'PANEL ADMIN · KELOLA ROOM ONLINE';
    card.appendChild(title);

    const tabsRow = document.createElement('div');
    tabsRow.className = 'sf-tabs-row is-2';
    tabsRow.setAttribute('role', 'tablist');

    const usersTabBtn = document.createElement('button');
    usersTabBtn.type = 'button';
    usersTabBtn.id = 'sf-admin-tab-users';
    usersTabBtn.className = 'sf-tab-btn';
    usersTabBtn.setAttribute('role', 'tab');
    usersTabBtn.setAttribute('aria-selected', String(this.adminTab === 'users'));
    usersTabBtn.textContent = `DAFTAR USER (${this.adminUsers.length})`;
    usersTabBtn.addEventListener('click', () => {
      this.audio.playUiClick(false);
      this.adminTab = 'users';
      this.adminAlert = null;
      this.renderUI();
    });

    const roomsTabBtn = document.createElement('button');
    roomsTabBtn.type = 'button';
    roomsTabBtn.id = 'sf-admin-tab-rooms';
    roomsTabBtn.className = 'sf-tab-btn';
    roomsTabBtn.setAttribute('role', 'tab');
    roomsTabBtn.setAttribute('aria-selected', String(this.adminTab === 'rooms'));
    roomsTabBtn.textContent = `KELOLA ROOM (${this.onlineRooms.length})`;
    roomsTabBtn.addEventListener('click', () => {
      this.audio.playUiClick(false);
      this.adminTab = 'rooms';
      this.adminAlert = null;
      this.peerSession.connectLobby();
      this.renderUI();
    });

    tabsRow.appendChild(usersTabBtn);
    tabsRow.appendChild(roomsTabBtn);
    card.appendChild(tabsRow);

    if (this.adminAlert) {
      const alertBox = document.createElement('div');
      alertBox.className = `sf-form-alert ${
        this.adminAlert.type === 'success' ? 'is-success' : 'is-error'
      }`;
      alertBox.style.marginBottom = '10px';
      alertBox.textContent = this.adminAlert.text;
      card.appendChild(alertBox);
    }

    if (this.adminTab === 'users') {
      const toolbar = document.createElement('div');
      toolbar.className = 'sf-admin-toolbar';

      const searchInput = document.createElement('input');
      searchInput.id = 'sf-admin-search-input';
      searchInput.type = 'search';
      searchInput.className = 'sf-text-input';
      searchInput.placeholder = 'Cari user berdasarkan Email atau UID...';
      searchInput.value = this.adminSearchQuery;
      searchInput.setAttribute('aria-label', 'Cari user berdasarkan email atau UID');
      searchInput.addEventListener('input', () => {
        this.adminSearchQuery = searchInput.value;
        this.updateAdminUserListDom();
      });

      const countBadge = document.createElement('div');
      countBadge.id = 'sf-admin-user-count';
      countBadge.className = 'sf-admin-count-badge';
      countBadge.textContent = `${this.adminUsers.length} / ${this.adminUsers.length} USER`;

      toolbar.appendChild(searchInput);
      toolbar.appendChild(countBadge);
      card.appendChild(toolbar);

      const listEl = document.createElement('div');
      listEl.id = 'sf-admin-user-list';
      listEl.className = 'sf-admin-list';
      card.appendChild(listEl);
    } else {
      const toolbar = document.createElement('div');
      toolbar.className = 'sf-admin-toolbar';

      const roomSearch = document.createElement('input');
      roomSearch.id = 'sf-admin-room-search-input';
      roomSearch.type = 'search';
      roomSearch.className = 'sf-text-input';
      roomSearch.placeholder = 'Cari room berdasarkan Nama, ID, atau Pembuat...';
      roomSearch.value = this.adminRoomSearchQuery;
      roomSearch.setAttribute('aria-label', 'Cari room online');
      roomSearch.addEventListener('input', () => {
        this.adminRoomSearchQuery = roomSearch.value;
        this.updateAdminRoomListDom();
      });

      const countBadge = document.createElement('div');
      countBadge.id = 'sf-admin-room-count';
      countBadge.className = 'sf-admin-count-badge';
      countBadge.textContent = `${this.onlineRooms.length} / ${this.onlineRooms.length} ROOM`;

      toolbar.appendChild(roomSearch);
      toolbar.appendChild(countBadge);
      card.appendChild(toolbar);

      const listEl = document.createElement('div');
      listEl.id = 'sf-admin-room-list';
      listEl.className = 'sf-admin-list';
      card.appendChild(listEl);
    }

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'sf-btn sf-btn-primary';
    closeBtn.style.width = '100%';
    closeBtn.textContent = 'TUTUP PANEL ADMIN';
    closeBtn.addEventListener('click', () => {
      this.audio.playUiClick(false);
      this.closeAdminModal();
    });
    card.appendChild(closeBtn);

    backdrop.appendChild(card);
    this.uiLayerEl.appendChild(backdrop);

    if (this.adminTab === 'users') {
      this.updateAdminUserListDom();
    } else {
      this.updateAdminRoomListDom();
    }
  }

  private renderAdminUserDetailModal(targetUser: AdminUserRecord): void {
    const isSelfAdmin = targetUser.email.trim().toLowerCase() === ADMIN_EMAIL;
    if (!this.adminDraftChars) {
      this.adminDraftChars = createAdminCharDraftMap(targetUser.customCharacters);
      this.adminDraftBlocked = targetUser.isBlocked;
    }
    const draftChars = this.adminDraftChars;

    const backdrop = document.createElement('div');
    backdrop.className = 'sf-modal-backdrop sf-settings-backdrop';

    const card = document.createElement('div');
    card.className = 'sf-modal-card sf-modal-admin';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'sf-admin-detail-title');

    const topBar = document.createElement('div');
    topBar.className = 'sf-admin-detail-top';

    const backBtn = document.createElement('button');
    backBtn.type = 'button';
    backBtn.className = 'sf-btn sf-btn-compact';
    backBtn.textContent = '← KEMBALI KE DAFTAR USER';
    backBtn.disabled = this.adminDetailSaving;
    backBtn.addEventListener('click', () => this.closeAdminUserDetail());

    const badge = document.createElement('div');
    badge.className = 'sf-index-badge';
    badge.innerHTML = `<span class="sf-red-pip"></span><span>INSPEKSI &amp; EDIT AKUN</span>`;

    topBar.appendChild(backBtn);
    topBar.appendChild(badge);
    card.appendChild(topBar);

    const title = document.createElement('h2');
    title.className = 'sf-modal-title';
    title.id = 'sf-admin-detail-title';
    title.textContent = 'INFORMASI LENGKAP AKUN USER';
    card.appendChild(title);

    if (this.adminAlert) {
      const alertBox = document.createElement('div');
      alertBox.className = `sf-form-alert ${
        this.adminAlert.type === 'success' ? 'is-success' : 'is-error'
      }`;
      alertBox.style.marginBottom = '10px';
      alertBox.textContent = this.adminAlert.text;
      card.appendChild(alertBox);
    }

    // Account info summary grid
    const accountBox = document.createElement('div');
    accountBox.className = 'sf-admin-account-box';

    const addInfoCell = (label: string, valEl: HTMLElement | string) => {
      const item = document.createElement('div');
      item.className = 'sf-admin-account-item';
      const k = document.createElement('div');
      k.className = 'sf-admin-account-k';
      k.textContent = label;
      const v = document.createElement('div');
      v.className = 'sf-admin-account-v';
      if (typeof valEl === 'string') {
        v.textContent = valEl;
      } else {
        v.appendChild(valEl);
      }
      item.appendChild(k);
      item.appendChild(v);
      accountBox.appendChild(item);
    };

    addInfoCell('ALAMAT EMAIL', targetUser.email);
    addInfoCell('UID USER', targetUser.uid);

    const statusTag = document.createElement('span');
    statusTag.className = `sf-admin-status-tag ${this.adminDraftBlocked ? 'is-blocked' : 'is-ok'}`;
    statusTag.textContent = this.adminDraftBlocked ? 'DIBLOKIR' : 'AKTIF';
    addInfoCell('STATUS AKUN', statusTag);

    const activityText =
      targetUser.lastSeen > 0
        ? `Aktif: ${formatAdminTimestamp(targetUser.lastSeen)} · Daftar: ${formatAdminTimestamp(
            targetUser.createdAt
          )}`
        : `Terdaftar: ${formatAdminTimestamp(targetUser.createdAt)}`;
    addInfoCell('WAKTU AKTIF & DAFTAR', activityText);

    card.appendChild(accountBox);

    // Block / Unblock control panel
    const blockPanel = document.createElement('div');
    blockPanel.className = `sf-admin-block-panel${this.adminDraftBlocked ? ' is-blocked' : ''}`;

    const blockCopy = document.createElement('div');
    blockCopy.style.cssText = 'font-family:var(--sf-font-mono);font-size:10.5px;font-weight:700;';
    blockCopy.textContent = isSelfAdmin
      ? 'STATUS AKSES: AKUN ADMIN UTAMA (TIDAK DAPAT DIBLOKIR)'
      : this.adminDraftBlocked
        ? 'STATUS AKSES: DIBLOKIR — User akan otomatis keluar & ditolak login.'
        : 'STATUS AKSES: AKTIF — User dapat login dan bermain normal.';
    blockPanel.appendChild(blockCopy);

    if (!isSelfAdmin) {
      const blockToggleBtn = document.createElement('button');
      blockToggleBtn.type = 'button';
      blockToggleBtn.className = `sf-btn sf-btn-compact${
        this.adminDraftBlocked ? '' : ' sf-btn-primary'
      }`;
      blockToggleBtn.disabled = this.adminDetailSaving;
      blockToggleBtn.textContent = this.adminDraftBlocked
        ? 'BUKA BLOKIR'
        : 'BLOKIR AKSES GAME';
      blockToggleBtn.addEventListener('click', () => {
        this.audio.playUiClick(false);
        this.adminDraftBlocked = !this.adminDraftBlocked;
        this.renderUI();
      });
      blockPanel.appendChild(blockToggleBtn);
    }
    card.appendChild(blockPanel);

    // 4 Character inspection & editing gallery
    const galleryLabel = document.createElement('div');
    galleryLabel.className = 'sf-field-label';
    galleryLabel.style.marginBottom = '8px';
    galleryLabel.textContent = 'GALERI & EDIT 4 KARAKTER KELUARGA (NAMA & FOTO WAJAH)';
    card.appendChild(galleryLabel);

    const charGrid = document.createElement('div');
    charGrid.className = 'sf-admin-char-grid';

    CHARACTER_ORDER.forEach((charId, idx) => {
      const draftEntry = draftChars[charId];
      const hasCustomFace = isValidFaceDataUrl(draftEntry.faceBase64);

      const charCard = document.createElement('div');
      charCard.className = 'sf-admin-char-card';

      const head = document.createElement('div');
      head.className = 'sf-admin-char-card-head';

      const slotTitle = document.createElement('div');
      slotTitle.className = 'sf-admin-char-slot';
      slotTitle.textContent = `SLOT ${idx + 1} · ${CHARACTERS[charId].name}`;

      const sourceTag = document.createElement('span');
      sourceTag.className = `sf-admin-source-tag ${hasCustomFace ? 'is-custom' : 'is-default'}`;
      sourceTag.textContent = hasCustomFace ? 'KUSTOM' : 'DEFAULT';

      head.appendChild(slotTitle);
      head.appendChild(sourceTag);
      charCard.appendChild(head);

      const ovalRow = document.createElement('div');
      ovalRow.className = 'sf-admin-oval-wrap';

      const ovalPreview = document.createElement('div');
      ovalPreview.className = 'sf-admin-oval-preview';
      const faceImg = document.createElement('img');
      faceImg.src = getEffectiveCharacterFaceSrc(charId, null, draftEntry.faceBase64);
      faceImg.alt = `Wajah ${draftEntry.name}`;
      ovalPreview.appendChild(faceImg);

      const nameCol = document.createElement('div');
      nameCol.style.cssText = 'flex:1;min-width:0;display:flex;flex-direction:column;gap:4px;';

      const nameLabel = document.createElement('label');
      nameLabel.className = 'sf-field-label';
      nameLabel.textContent = 'NAMA KARAKTER';

      const nameInput = document.createElement('input');
      nameInput.type = 'text';
      nameInput.className = 'sf-text-input';
      nameInput.maxLength = MAX_CHARACTER_NAME_LEN;
      nameInput.value = draftEntry.name;
      nameInput.placeholder = CHARACTERS[charId].name;
      nameInput.disabled = this.adminDetailSaving;
      nameInput.addEventListener('input', () => {
        draftEntry.name = nameInput.value;
      });

      const photoHint = document.createElement('div');
      photoHint.style.cssText = 'font-family:var(--sf-font-mono);font-size:9px;color:#555;';
      photoHint.textContent = hasCustomFace
        ? `Foto kustom (${Math.round(estimateDataUrlBytes(draftEntry.faceBase64!) / 1024)} KB)`
        : 'Menggunakan wajah karakter bawaan (Default)';

      nameCol.appendChild(nameLabel);
      nameCol.appendChild(nameInput);
      nameCol.appendChild(photoHint);

      ovalRow.appendChild(ovalPreview);
      ovalRow.appendChild(nameCol);
      charCard.appendChild(ovalRow);

      // File upload + reset to default buttons
      const fileInput = document.createElement('input');
      fileInput.type = 'file';
      fileInput.accept = 'image/*';
      fileInput.className = 'sf-file-input-hidden';
      fileInput.addEventListener('change', () => {
        const file = fileInput.files?.[0];
        fileInput.value = '';
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = typeof reader.result === 'string' ? reader.result : '';
          if (!dataUrl) return;
          const img = new Image();
          img.onload = () => {
            const cropped = autoFitOvalFaceDataUrl(img);
            if (!isValidFaceDataUrl(cropped)) {
              this.adminAlert = {
                type: 'error',
                text: `Gagal memproses foto untuk ${CHARACTERS[charId].name}. Pilih foto lain.`,
              };
              this.renderUI();
              return;
            }
            draftEntry.faceBase64 = cropped;
            faceImg.src = cropped;
            sourceTag.className = 'sf-admin-source-tag is-custom';
            sourceTag.textContent = 'KUSTOM';
            photoHint.textContent = `Foto baru siap (${Math.round(
              estimateDataUrlBytes(cropped) / 1024
            )} KB)`;
            resetBtn.disabled = false;
            this.adminAlert = null;
          };
          img.onerror = () => {
            this.adminAlert = {
              type: 'error',
              text: 'File gambar tidak valid atau gagal dimuat.',
            };
            this.renderUI();
          };
          img.src = dataUrl;
        };
        reader.readAsDataURL(file);
      });

      const actionsRow = document.createElement('div');
      actionsRow.className = 'sf-admin-char-actions';

      const uploadBtn = document.createElement('button');
      uploadBtn.type = 'button';
      uploadBtn.className = 'sf-btn sf-btn-compact';
      uploadBtn.textContent = 'GANTI FOTO (UPLOAD)';
      uploadBtn.disabled = this.adminDetailSaving;
      uploadBtn.addEventListener('click', () => {
        this.audio.playUiClick(false);
        fileInput.click();
      });

      const resetBtn = document.createElement('button');
      resetBtn.type = 'button';
      resetBtn.className = 'sf-btn sf-btn-compact';
      resetBtn.textContent = 'RESET FOTO KE DEFAULT';
      resetBtn.disabled = this.adminDetailSaving || !hasCustomFace;
      resetBtn.addEventListener('click', () => {
        this.audio.playUiClick(false);
        draftEntry.faceBase64 = null;
        faceImg.src = getEffectiveCharacterFaceSrc(charId, null, null);
        sourceTag.className = 'sf-admin-source-tag is-default';
        sourceTag.textContent = 'DEFAULT';
        photoHint.textContent = 'Menggunakan wajah karakter bawaan (Default)';
        resetBtn.disabled = true;
      });

      actionsRow.appendChild(fileInput);
      actionsRow.appendChild(uploadBtn);
      actionsRow.appendChild(resetBtn);
      charCard.appendChild(actionsRow);

      charGrid.appendChild(charCard);
    });

    card.appendChild(charGrid);

    const footerActions = document.createElement('div');
    footerActions.className = 'sf-admin-footer-actions';

    const saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.className = 'sf-btn sf-btn-primary';
    saveBtn.disabled = this.adminDetailSaving;
    saveBtn.textContent = this.adminDetailSaving ? 'MENYIMPAN PERUBAHAN...' : 'SIMPAN PERUBAHAN';
    saveBtn.addEventListener('click', async () => {
      if (this.adminDetailSaving) return;
      this.audio.playUiClick(false);
      this.adminDetailSaving = true;
      this.adminAlert = null;
      this.renderUI();
      try {
        await adminUpdateUserAccount(
          targetUser.uid,
          targetUser.email,
          this.adminDraftBlocked,
          draftChars
        );
        this.adminDetailSaving = false;
        this.adminAlert = {
          type: 'success',
          text: 'Perubahan nama, foto, dan status blokir berhasil disimpan ke Firebase & tersinkron real-time.',
        };
        this.renderUI();
      } catch (err) {
        this.adminDetailSaving = false;
        this.adminAlert = {
          type: 'error',
          text: err instanceof Error ? err.message : 'Gagal menyimpan perubahan akun user.',
        };
        this.renderUI();
      }
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'sf-btn';
    cancelBtn.disabled = this.adminDetailSaving;
    cancelBtn.textContent = 'KEMBALI KE DAFTAR';
    cancelBtn.addEventListener('click', () => this.closeAdminUserDetail());

    footerActions.appendChild(saveBtn);
    footerActions.appendChild(cancelBtn);
    card.appendChild(footerActions);

    backdrop.appendChild(card);
    this.uiLayerEl.appendChild(backdrop);
  }

  private renderAboutModal(): void {
    const backdrop = document.createElement('div');
    backdrop.className = 'sf-modal-backdrop sf-settings-backdrop';

    const card = document.createElement('div');
    card.className = 'sf-modal-card';
    card.setAttribute('role', 'dialog');
    card.setAttribute('aria-modal', 'true');
    card.setAttribute('aria-labelledby', 'sf-about-title');

    const badge = document.createElement('div');
    badge.className = 'sf-index-badge';
    badge.style.cssText = 'justify-content:center;margin-bottom:8px;';
    badge.innerHTML = `<span class="sf-red-pip"></span><span>INFORMASI &amp; KONTAK PEMBUAT</span>`;
    card.appendChild(badge);

    const title = document.createElement('h2');
    title.className = 'sf-modal-title';
    title.id = 'sf-about-title';
    title.textContent = 'ABOUT GAME';
    card.appendChild(title);

    const box = document.createElement('div');
    box.className = 'sf-about-box';
    box.innerHTML = `
      <div><strong>ADNAN FAMILY FIGHTER</strong> · 2.5D ARENA EDITION</div>
      <div>COPYRIGHT &copy; <strong>@adnanjogja</strong></div>
      <div>EMAIL: <a class="sf-about-link" href="mailto:adnanjogja@gmail.com">adnanjogja@gmail.com</a></div>
      <div>INSTAGRAM: <a class="sf-about-link" href="https://instagram.com/adnanjogja" target="_blank" rel="noopener noreferrer">@adnanjogja</a></div>
    `;
    card.appendChild(box);

    const note = document.createElement('p');
    note.className = 'sf-modal-copy';
    note.textContent =
      'Hubungi email atau Instagram di atas jika memerlukan bantuan akun atau masukan untuk game.';
    card.appendChild(note);

    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'sf-btn sf-btn-primary';
    closeBtn.style.width = '100%';
    closeBtn.textContent = 'TUTUP';
    closeBtn.addEventListener('click', () => {
      this.audio.playUiClick(false);
      this.showAboutModal = false;
      this.renderUI();
    });
    card.appendChild(closeBtn);

    backdrop.appendChild(card);
    this.uiLayerEl.appendChild(backdrop);
  }

  private startRoomChatSubscription(roomCode: string): void {
    this.stopRoomChatSubscription();
    if (!roomCode) return;
    this.chatMessages = [];
    this.chatUnreadCount = 0;
    this.chatLatestPreview = null;
    this.chatLastSeenMsgId = '';
    this.chatUnsub = subscribeRoomMessages(roomCode, (messages) => {
      const prevCount = this.chatMessages.length;
      const latest = messages.length > 0 ? messages[messages.length - 1] : null;
      const isNewIncoming =
        Boolean(latest) &&
        latest!.id !== this.chatLastSeenMsgId &&
        messages.length >= prevCount &&
        latest!.senderRole !== this.onlineRole;

      this.chatMessages = messages;
      if (this.chatOpen) {
        this.chatUnreadCount = 0;
        this.chatLatestPreview = null;
        if (latest) this.chatLastSeenMsgId = latest.id;
      } else if (isNewIncoming && latest) {
        this.chatUnreadCount += 1;
        this.chatLatestPreview = `${latest.senderName}: ${latest.text}`;
        this.chatLastSeenMsgId = latest.id;
      }

      if (this.chatDockEl) {
        this.refreshLiveChatDockContents();
      }
    });
  }

  private stopRoomChatSubscription(): void {
    if (this.chatUnsub) {
      try {
        this.chatUnsub();
      } catch {
        // ignore
      }
      this.chatUnsub = null;
    }
    this.chatMessages = [];
    this.chatUnreadCount = 0;
    this.chatLatestPreview = null;
    this.chatOpen = false;
    this.chatInputDraft = '';
    this.chatLastSeenMsgId = '';
  }

  private renderLiveChatDock(): void {
    const dock = document.createElement('div');
    dock.className = `sf-chat-dock${this.screen === 'char_stage_select' ? ' is-menu' : ''}`;
    dock.id = 'sf-chat-dock';
    this.chatDockEl = dock;
    this.refreshLiveChatDockContents();
    this.uiLayerEl.appendChild(dock);
  }

  private refreshLiveChatDockContents(): void {
    const dock = this.chatDockEl;
    if (!dock) return;
    dock.innerHTML = '';

    const toggleRow = document.createElement('div');
    toggleRow.className = 'sf-chat-toggle-row';

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = 'sf-chat-toggle-btn';
    toggleBtn.id = 'sf-chat-toggle-btn';
    toggleBtn.setAttribute('aria-expanded', String(this.chatOpen));
    toggleBtn.setAttribute('aria-label', 'Buka atau Tutup Live Chat Room');

    if (this.chatUnreadCount > 0 && !this.chatOpen) {
      const dot = document.createElement('span');
      dot.className = 'sf-chat-unread-dot';
      toggleBtn.appendChild(dot);
    }

    const btnLabel = document.createElement('span');
    btnLabel.textContent = this.chatOpen
      ? 'CHAT · TUTUP'
      : this.chatUnreadCount > 0
        ? `CHAT (${this.chatUnreadCount})`
        : 'CHAT';
    toggleBtn.appendChild(btnLabel);

    toggleBtn.addEventListener('click', (e) => {
      e.currentTarget && (e.currentTarget as HTMLElement).blur();
      this.audio.playUiClick(false);
      this.chatOpen = !this.chatOpen;
      if (this.chatOpen) {
        this.chatUnreadCount = 0;
        this.chatLatestPreview = null;
        if (this.chatMessages.length > 0) {
          this.chatLastSeenMsgId = this.chatMessages[this.chatMessages.length - 1].id;
        }
      }
      this.refreshLiveChatDockContents();
    });
    toggleRow.appendChild(toggleBtn);

    if (!this.chatOpen && this.chatLatestPreview) {
      const preview = document.createElement('div');
      preview.className = 'sf-chat-preview-toast';
      preview.textContent = this.chatLatestPreview;
      toggleRow.appendChild(preview);
    }

    dock.appendChild(toggleRow);

    if (!this.chatOpen) return;

    const panel = document.createElement('div');
    panel.className = 'sf-chat-panel';

    const head = document.createElement('div');
    head.className = 'sf-chat-head';
    const headRoom = document.createElement('span');
    headRoom.textContent = `ROOM: ${this.onlineRoomName || this.onlineRoomCode}`;
    const headCount = document.createElement('span');
    headCount.textContent = `${this.chatMessages.length} PESAN`;
    head.appendChild(headRoom);
    head.appendChild(headCount);
    panel.appendChild(head);

    const msgsEl = document.createElement('div');
    msgsEl.className = 'sf-chat-messages';
    if (this.chatMessages.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'sf-chat-msg';
      empty.style.opacity = '0.6';
      empty.textContent = 'Belum ada pesan. Sapa lawanmu!';
      msgsEl.appendChild(empty);
    } else {
      for (const msg of this.chatMessages) {
        const line = document.createElement('div');
        line.className = 'sf-chat-msg';
        const sender = document.createElement('span');
        sender.className = `sf-chat-msg-sender${msg.senderRole === this.onlineRole ? ' is-mine' : ''}`;
        sender.textContent = `${msg.senderName}: `;
        const body = document.createElement('span');
        body.textContent = msg.text;
        line.appendChild(sender);
        line.appendChild(body);
        msgsEl.appendChild(line);
      }
    }
    panel.appendChild(msgsEl);

    const form = document.createElement('form');
    form.className = 'sf-chat-form';
    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'sf-chat-input';
    input.className = 'sf-chat-input';
    input.maxLength = 140;
    input.placeholder = 'Tulis pesan...';
    input.value = this.chatInputDraft;
    input.setAttribute('aria-label', 'Ketik pesan chat');
    input.addEventListener('input', () => {
      this.chatInputDraft = input.value;
    });

    const sendBtn = document.createElement('button');
    sendBtn.type = 'submit';
    sendBtn.className = 'sf-chat-send-btn';
    sendBtn.textContent = 'KIRIM';

    form.appendChild(input);
    form.appendChild(sendBtn);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = sanitizeChatMessageText(this.chatInputDraft);
      if (!text || !this.onlineRoomCode) return;
      const myChar = this.onlineRole === 'host' ? this.selectedP1 : this.selectedP2;
      const myLabel = getEffectiveCharacterName(myChar, this.authSession?.customCharacters);
      this.chatInputDraft = '';
      input.value = '';
      try {
        await sendRoomMessage(this.onlineRoomCode, {
          senderName: myLabel,
          senderRole: this.onlineRole,
          uid: this.authSession?.uid || null,
          text,
        });
      } catch (err) {
        console.error('Chat send error:', err);
      }
    });

    panel.appendChild(form);
    dock.appendChild(panel);
    requestAnimationFrame(() => {
      msgsEl.scrollTop = msgsEl.scrollHeight;
    });
  }

  private syncHudRefs(): void {
    if (!this.matchState) return;
    const m = this.matchState;
    const isOnline = m.mode === 'online_1v1';
    const localFighter = isOnline && this.onlineRole === 'guest' ? m.p2 : m.p1;

    const p1Pct = Math.max(0, Math.min(100, (m.p1.hp / m.p1.maxHp) * 100));
    const p1TrailPct = Math.max(0, Math.min(100, (m.p1.trailHp / m.p1.maxHp) * 100));
    const p2Pct = Math.max(0, Math.min(100, (m.p2.hp / m.p2.maxHp) * 100));
    const p2TrailPct = Math.max(0, Math.min(100, (m.p2.trailHp / m.p2.maxHp) * 100));

    if (this.p1HpFillEl) this.p1HpFillEl.style.width = `${p1Pct.toFixed(1)}%`;
    if (this.p1HpTrailEl) this.p1HpTrailEl.style.width = `${p1TrailPct.toFixed(1)}%`;
    if (this.p2HpFillEl) this.p2HpFillEl.style.width = `${p2Pct.toFixed(1)}%`;
    if (this.p2HpTrailEl) this.p2HpTrailEl.style.width = `${p2TrailPct.toFixed(1)}%`;

    const p1GuardPct = Math.max(0, Math.min(100, m.p1.guardStamina));
    const p2GuardPct = Math.max(0, Math.min(100, m.p2.guardStamina));
    if (this.p1GuardFillEl) {
      this.p1GuardFillEl.style.width = `${p1GuardPct.toFixed(1)}%`;
      this.p1GuardFillEl.classList.toggle('is-burnout', m.p1.burnoutTimer > 0);
    }
    if (this.p2GuardFillEl) {
      this.p2GuardFillEl.style.width = `${p2GuardPct.toFixed(1)}%`;
      this.p2GuardFillEl.classList.toggle('is-burnout', m.p2.burnoutTimer > 0);
    }

    const syncFsmBadge = (el: HTMLDivElement | null, f: typeof m.p1) => {
      if (!el) return;
      let label = '';
      let isBurnout = false;
      switch (f.charFsmStatus) {
        case 'mager':
          label = 'MODE MAGER · ARMOR';
          break;
        case 'omelan':
          label = `MODE OMELAN · ${Math.round(f.omelanMeter)}%`;
          break;
        case 'counter_stance':
          label = 'POSE CENTIL · COUNTER';
          break;
        case 'rewel':
          label = 'MODE REWEL · TANTRUM';
          break;
        case 'burnout':
          label = 'BURNOUT · LELAH!';
          isBurnout = true;
          break;
        default:
          label = '';
      }
      if (!label) {
        el.style.display = 'none';
      } else {
        el.style.display = 'inline-block';
        el.textContent = label;
        el.classList.toggle('is-burnout', isBurnout);
      }
    };
    syncFsmBadge(this.p1FsmTagEl, m.p1);
    syncFsmBadge(this.p2FsmTagEl, m.p2);

    if (this.timerNumEl) {
      this.timerNumEl.textContent = m.mode === 'training' ? '∞' : String(Math.ceil(m.roundTimer));
    }
    if (this.roundTagEl) {
      this.roundTagEl.textContent = m.mode === 'training' ? 'TRAINING' : `ROUND 0${m.roundNumber}`;
    }

    const roundsSig = `${m.p1.roundsWon}-${m.p2.roundsWon}`;
    if (roundsSig !== this.lastRoundsSignature && this.p1PipsEl && this.p2PipsEl) {
      this.lastRoundsSignature = roundsSig;
      this.p1PipsEl.innerHTML = [0, 1]
        .map((i) => `<span class="sf-round-pip ${i < m.p1.roundsWon ? 'won' : ''}"></span>`)
        .join('');
      this.p2PipsEl.innerHTML = [0, 1]
        .map((i) => `<span class="sf-round-pip ${i < m.p2.roundsWon ? 'won' : ''}"></span>`)
        .join('');
    }

    // Super gauge (local player)
    const superPct = Math.floor(localFighter.superMeter);
    if (this.superFillEl) {
      this.superFillEl.style.width = `${superPct}%`;
      this.superFillEl.classList.toggle('ready', superPct >= 100);
    }
    if (this.superLabelEl) {
      this.superLabelEl.textContent =
        superPct >= 100 ? 'SUPER PENUH · TEKAN [SUPER] / [I]' : `SUPER GAUGE · ${superPct}%`;
    }
    if (this.superTouchBtnEl) {
      if (superPct >= 100) {
        this.superTouchBtnEl.classList.add('sf-tbtn-super-ready');
        this.superTouchBtnEl.classList.remove('sf-tbtn-super-disabled');
      } else {
        this.superTouchBtnEl.classList.remove('sf-tbtn-super-ready');
        this.superTouchBtnEl.classList.add('sf-tbtn-super-disabled');
      }
    }

    // Combo badge
    if (this.comboEl) {
      if (localFighter.comboCountDealt >= 2) {
        this.comboEl.style.display = 'inline-block';
        this.comboEl.textContent = `${localFighter.comboCountDealt} HITS COMBO!`;
      } else {
        this.comboEl.style.display = 'none';
      }
    }

    // Center Banner (Round 1 / 3-2-1 Countdown / Fight! / KO / Super Move Callout)
    const bannerMain = m.pendingSuperBannerTimer > 0 ? m.pendingSuperName : m.bannerText;
    const bannerSub = m.pendingSuperBannerTimer > 0 ? 'JURUS PAMUNGKAS!' : m.subBannerText;
    const sig = `${bannerMain}|${bannerSub}`;
    if (sig !== this.lastBannerSignature && this.bannerWrapEl) {
      this.lastBannerSignature = sig;
      if (!bannerMain) {
        this.bannerWrapEl.innerHTML = '';
      } else {
        const isCountdown = bannerMain === '3' || bannerMain === '2' || bannerMain === '1';
        this.bannerWrapEl.innerHTML = `
          <div class="sf-banner-box${isCountdown ? ' sf-banner-countdown' : ''}">${bannerMain}</div>
          ${bannerSub ? `<div class="sf-subbanner">${bannerSub}</div>` : ''}
        `;
      }
    }

    if (this.screen === 'replay' && this.replayPlayback) {
      const pb = this.replayPlayback;
      const ts = m.timeScale;
      const isSlow = !pb.paused && !pb.finished && ts < 0.9;
      const isKoSlow = isSlow && (pb.autoSlowMoKind === 'ko' || (m.dramaticCam.active && m.dramaticCam.isKo));
      const pct = Math.round(getReplayProgress(pb) * 100);

      if (this.replayBadgeEl) {
        this.replayBadgeEl.classList.toggle('is-ko', isKoSlow);
        this.replayBadgeEl.classList.toggle('is-big-hit', isSlow && !isKoSlow);
        this.replayBadgeEl.classList.toggle('is-paused', pb.paused);
        const badgeTxt = this.replayBadgeEl.querySelector('#sf-replay-badge-txt');
        if (badgeTxt) {
          if (pb.finished) {
            badgeTxt.textContent = `REPLAY SELESAI · ${ts.toFixed(2)}X`;
          } else if (pb.paused) {
            badgeTxt.textContent = `REPLAY DIJEDA · ${ts.toFixed(2)}X`;
          } else if (isKoSlow) {
            badgeTxt.textContent = `SLOW-MO K.O. · ${ts.toFixed(2)}X`;
          } else if (isSlow) {
            badgeTxt.textContent = `SLOW-MO HIT BESAR · ${ts.toFixed(2)}X`;
          } else {
            badgeTxt.textContent = `REPLAY · ${ts.toFixed(2)}X`;
          }
        }
      }

      if (this.replayProgressFillEl) {
        this.replayProgressFillEl.style.width = `${pct}%`;
      }
      if (this.replayTimeEl) {
        this.replayTimeEl.textContent = `${m.matchTimeElapsed.toFixed(1)}S / ${pb.recording.totalDuration.toFixed(1)}S · ${ts.toFixed(2)}X`;
      }
      if (this.replayPlayPauseBtnEl) {
        this.replayPlayPauseBtnEl.textContent = pb.finished ? 'PUTAR ULANG' : pb.paused ? 'PUTAR' : 'JEDA';
      }
      if (this.replaySpeedBtnEl) {
        this.replaySpeedBtnEl.textContent = `KEC: ${pb.userSpeed}X`;
      }
    }
  }

  private readDirectionalAxes(): { x: number; y: number } {
    let mx = this.joyVec.x;
    let my = this.joyVec.y;
    if (this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft')) mx -= 1;
    if (this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight')) mx += 1;
    if (this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp')) my += 1;
    if (this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown')) my -= 1;
    return {
      x: Math.max(-1, Math.min(1, mx)),
      y: Math.max(-1, Math.min(1, my)),
    };
  }

  private collectHoldOnlyInput(): InputSnapshot {
    const inp = createEmptyInput();
    const { x, y } = this.readDirectionalAxes();
    inp.moveX = x;
    inp.moveY = y;
    inp.blockHeld = this.keysHeld.has('KeyU') || this.touchHeld.block;
    return inp;
  }

  private collectPlayerInput(): InputSnapshot {
    const inp = createEmptyInput();
    const { x, y } = this.readDirectionalAxes();
    inp.moveX = x;
    inp.moveY = y;
    inp.punchHeld = this.keysHeld.has('KeyJ') || this.touchHeld.punch;
    inp.kickHeld = this.keysHeld.has('KeyK') || this.touchHeld.kick;
    inp.spHeld = this.keysHeld.has('KeyL') || this.touchHeld.sp;
    inp.blockHeld = this.keysHeld.has('KeyU') || this.touchHeld.block;
    inp.superHeld = this.keysHeld.has('KeyI') || this.touchHeld.super;

    inp.punchPressed = this.queuedPresses.punch;
    inp.kickPressed = this.queuedPresses.kick;
    inp.spPressed = this.queuedPresses.sp;
    inp.superPressed = this.queuedPresses.super;

    this.queuedPresses.punch = false;
    this.queuedPresses.kick = false;
    this.queuedPresses.sp = false;
    this.queuedPresses.super = false;
    return inp;
  }

  private advanceMatchEndTransition(dt: number): void {
    this.recordCompletedOnlineMatchIfNeeded();
    const victoryDuration = 4.8;
    const fadeStart = 3.9;
    this.matchEndOverlayDelay += dt;
    if (this.fadeCurtainEl) {
      if (this.matchEndOverlayDelay >= fadeStart) {
        const p = Math.min(1, (this.matchEndOverlayDelay - fadeStart) / (victoryDuration - fadeStart));
        const eased = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        this.fadeCurtainEl.style.transition = 'none';
        this.fadeCurtainEl.style.opacity = eased.toFixed(3);
      } else {
        this.fadeCurtainEl.style.transition = 'none';
        this.fadeCurtainEl.style.opacity = '0';
      }
    }
    if (this.matchEndOverlayDelay >= victoryDuration) {
      this.audio.stopBgm();
      this.setScreen('gameover');
    }
  }

  private startLoop(): void {
    const tick = (rawTs?: number) => {
      if (this.isDestroyed) return;
      const ts = typeof rawTs === 'number' ? rawTs : performance.now();
      if (this.lastTs === 0) this.lastTs = ts;
      const rawDt = Math.max(0.001, (ts - this.lastTs) / 1000);
      this.lastTs = ts;
      const dt = Math.min(rawDt, 0.05);

      if (this.screen === 'title') {
        this.audio.setSlowMoFactor(1);
        this.elapsedTitle += dt;
        this.mainRenderer.renderTitleShowcase(this.elapsedTitle);
      } else if (this.screen === 'mode_select' || this.screen === 'online_lobby') {
        this.audio.setSlowMoFactor(1);
        this.elapsedTitle += dt;
      } else if (this.screen === 'char_stage_select') {
        this.audio.setSlowMoFactor(1);
        this.elapsedTitle += dt;
        if (this.previewRenderer) {
          this.previewRenderer.render(this.elapsedTitle);
        }
      } else if (this.matchState) {
        if (this.mode === 'online_1v1' && !this.disconnectedModalOpen) {
          if (this.screen === 'playing' || this.screen === 'paused') {
            const localIn =
              this.screen === 'playing' ? this.collectPlayerInput() : createEmptyInput();
            const { cues, netPackets } = stepOnlineMatch(
              this.matchState,
              this.onlineRole,
              localIn,
              this.remoteTarget,
              dt
            );
            this.audio.setSlowMoFactor(this.matchState.timeScale);
            for (const c of cues) this.audio.playCue(c);
            for (const pkt of netPackets) this.peerSession.sendReliable(pkt);

            this.netSendAccum += dt;
            if (this.netSendAccum >= 0.028) {
              this.netSendAccum = 0;
              const f = this.onlineRole === 'host' ? this.matchState.p1 : this.matchState.p2;
              const statePkt: NetStatePacket = {
                t: 'st',
                seq: ++this.netSeq,
                x: Math.round(f.x * 10) / 10,
                y: Math.round(f.y * 10) / 10,
                vx: Math.round(f.vx * 10) / 10,
                vy: Math.round(f.vy * 10) / 10,
                f: f.facing,
                s: f.state,
                m: f.currentMove ? f.currentMove.id : null,
                mt: Math.round(f.moveTimer * 1000) / 1000,
                wp: Math.round(f.walkPhase * 100) / 100,
                hp: Math.round(f.hp * 10) / 10,
                sm: Math.round(f.superMeter * 10) / 10,
                fs: f.charFsmStatus,
              };
              this.peerSession.sendUnreliable(statePkt);
            }

            this.syncHudRefs();
            if (this.matchState.roundPhase === 'match_end' && this.screen === 'playing') {
              this.advanceMatchEndTransition(dt);
            }
          }
        } else if (this.screen === 'playing') {
          const p1In = this.collectPlayerInput();
          const p2In = updateCpuInput(this.cpuBrain, this.matchState, dt);
          const hpBeforeP1 = this.matchState.p1.hp;
          const hpBeforeP2 = this.matchState.p2.hp;
          const cues = stepMatch(this.matchState, p1In, p2In, dt);
          if (this.replayRecorder) {
            recordReplayFrame(
              this.replayRecorder,
              p1In,
              p2In,
              dt,
              cues,
              hpBeforeP1,
              hpBeforeP2,
              this.matchState
            );
          }
          this.audio.setSlowMoFactor(this.matchState.timeScale);
          for (const c of cues) this.audio.playCue(c);

          this.syncHudRefs();
          if (this.matchState.roundPhase === 'match_end') {
            this.advanceMatchEndTransition(dt);
          }
        } else if (this.screen === 'replay' && this.replayPlayback) {
          const cues = stepReplayPlayback(this.replayPlayback, this.matchState, dt);
          this.audio.setSlowMoFactor(this.matchState.timeScale);
          for (const c of cues) this.audio.playCue(c);
          this.syncHudRefs();
        }
        this.mainRenderer.renderMatchScene(this.matchState);
      }

      const usingPreview = this.screen === 'char_stage_select' && this.previewRenderer !== null;
      const activeRenderer = usingPreview
        ? this.previewRenderer!.renderer
        : this.mainRenderer.renderer;
      const usingSoftwareGl = usingPreview
        ? this.previewRenderer!.isSoftwareGl
        : this.mainRenderer.isSoftwareGl;

      if (usingSoftwareGl) {
        scheduleAfterSoftwareDraw(
          activeRenderer,
          () => tick(performance.now()),
          (id) => {
            this.loopTimerId = id;
          }
        );
      } else {
        this.rafId = requestAnimationFrame(tick);
      }
    };
    this.rafId = requestAnimationFrame(tick);
  }
}
