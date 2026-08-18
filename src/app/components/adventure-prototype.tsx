import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Bot,
  Check,
  Crosshair,
  DoorClosed,
  LoaderCircle,
  Move,
  Play,
  Plus,
  RefreshCw,
  Shield,
  SkipForward,
  Swords,
  Trash2,
  UserPlus,
  Users,
  Wifi,
  WifiOff,
  X,
} from "lucide-react";
import {
  createAdventurePrototypeRoom,
  createPrototypeBot,
  deletePrototypeBot,
  listPrototypeBots,
  listPrototypeProfiles,
  listPrototypeRooms,
  sendPrototypeAction,
  subscribePrototypeRoom,
  type PrototypeConnectionState,
  type PrototypeBot,
  type PrototypeProfile,
  type PrototypeRoom,
} from "@/lib/adventure-prototype-api";
import {
  canControlPrototypeUnit,
  getPrototypeActiveUnit,
  getPrototypeReachablePoints,
} from "../../../supabase/functions/_shared/adventure-prototype";
import { ApiRequestError } from "@/lib/api-client";
import { retro } from "./retro-styles";
import { useInterfaceSession } from "./session-context";
import { S_ACCENT, S_DIM, S_GREEN, S_MUTED, S_RED, S_TEXT, S_WARN } from "./shared-styles";

type BoardMode = "move" | "attack";

const PANEL = { border: "1px solid #23295A", background: "#090D27" } as const;
const SUB_PANEL = { border: "1px solid #1B214A", background: "#070A20" } as const;

function statusColor(status: PrototypeRoom["status"]) {
  if (status === "active") return "#63E6A5";
  if (status === "completed") return "#FFD56A";
  if (status === "closed") return "#F47A91";
  return "#79B8FF";
}

function connectionView(state: PrototypeConnectionState) {
  if (state === "live") return { label: "LIVE", color: "#63E6A5", Icon: Wifi };
  if (state === "offline") return { label: "RECONNECTING", color: "#F47A91", Icon: WifiOff };
  if (state === "polling") return { label: "POLLING", color: "#FFD56A", Icon: RefreshCw };
  return { label: "CONNECTING", color: "#79B8FF", Icon: LoaderCircle };
}

function pointKey(x: number, y: number) {
  return `${x}:${y}`;
}

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export function AdventurePrototype({ onBack }: { onBack: () => void }) {
  const { playerId, isDM } = useInterfaceSession();
  const [rooms, setRooms] = useState<PrototypeRoom[]>([]);
  const [profiles, setProfiles] = useState<PrototypeProfile[]>([]);
  const [bots, setBots] = useState<PrototypeBot[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);
  const [room, setRoom] = useState<PrototypeRoom | null>(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [actionPending, setActionPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connection, setConnection] = useState<PrototypeConnectionState>("connecting");
  const [roomName, setRoomName] = useState("Prototype Encounter");
  const [invitedIds, setInvitedIds] = useState<string[]>([]);
  const [selectedBotIds, setSelectedBotIds] = useState<string[]>([]);
  const [botName, setBotName] = useState("");
  const [botBusy, setBotBusy] = useState(false);
  const [deletingBotId, setDeletingBotId] = useState<string | null>(null);
  const [mode, setMode] = useState<BoardMode>("move");

  const refreshOverview = useCallback(async () => {
    try {
      const [nextRooms, nextProfiles, nextBots] = await Promise.all([
        listPrototypeRooms(),
        isDM ? listPrototypeProfiles() : Promise.resolve([]),
        isDM ? listPrototypeBots() : Promise.resolve([]),
      ]);
      setRooms(nextRooms);
      setProfiles(nextProfiles);
      setBots(nextBots);
      setError(null);
      if (!isDM && !selectedRoomId && nextRooms.length === 1) setSelectedRoomId(nextRooms[0].id);
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not load Adventure rooms.");
    } finally {
      setLoading(false);
    }
  }, [isDM, selectedRoomId]);

  useEffect(() => {
    void refreshOverview();
  }, [refreshOverview]);

  useEffect(() => {
    if (!selectedRoomId) {
      setRoom(null);
      setConnection("connecting");
      return;
    }
    return subscribePrototypeRoom(
      selectedRoomId,
      (nextRoom) => {
        setRoom(nextRoom);
        setRooms((current) => {
          const exists = current.some((entry) => entry.id === nextRoom.id);
          return (exists
            ? current.map((entry) => entry.id === nextRoom.id ? nextRoom : entry)
            : [nextRoom, ...current]
          ).filter((entry) => entry.status !== "closed");
        });
        setError(null);
      },
      setConnection,
      (nextError) => {
        setError(nextError instanceof Error ? nextError.message : "Room synchronization is unavailable.");
      },
    );
  }, [selectedRoomId]);

  const createRoom = async () => {
    if (!isDM || invitedIds.length + selectedBotIds.length === 0) return;
    setCreating(true);
    setError(null);
    try {
      const nextRoom = await createAdventurePrototypeRoom({
        name: roomName,
        invitedPlayerIds: invitedIds,
        botIds: selectedBotIds,
      });
      setRooms((current) => [nextRoom, ...current.filter((entry) => entry.id !== nextRoom.id)]);
      setSelectedRoomId(nextRoom.id);
      setRoom(nextRoom);
      setInvitedIds([]);
      setSelectedBotIds([]);
      setRoomName("Prototype Encounter");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not create the room.");
    } finally {
      setCreating(false);
    }
  };

  const addBot = async () => {
    const name = botName.trim();
    if (!isDM || !name || botBusy) return;
    setBotBusy(true);
    setError(null);
    try {
      const bot = await createPrototypeBot(name);
      setBots((current) => [bot, ...current]);
      if (invitedIds.length + selectedBotIds.length < 6) {
        setSelectedBotIds((current) => [bot.id, ...current]);
      }
      setBotName("");
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not create the bot profile.");
    } finally {
      setBotBusy(false);
    }
  };

  const removeBot = async (bot: PrototypeBot) => {
    if (!isDM || deletingBotId) return;
    if (!window.confirm(`Delete bot profile "${bot.name}"? Existing rooms will keep their saved copy.`)) return;
    setDeletingBotId(bot.id);
    setError(null);
    try {
      await deletePrototypeBot(bot.id);
      setBots((current) => current.filter((entry) => entry.id !== bot.id));
      setSelectedBotIds((current) => current.filter((id) => id !== bot.id));
    } catch (nextError) {
      setError(nextError instanceof Error ? nextError.message : "Could not delete the bot profile.");
    } finally {
      setDeletingBotId(null);
    }
  };

  const dispatch = useCallback(async (
    type: Parameters<typeof sendPrototypeAction>[1],
    payload?: Parameters<typeof sendPrototypeAction>[2],
  ) => {
    if (!room || actionPending) return;
    setActionPending(true);
    setError(null);
    try {
      const nextRoom = await sendPrototypeAction(room, type, payload);
      setRoom(nextRoom);
    } catch (nextError) {
      if (nextError instanceof ApiRequestError && nextError.body?.room) {
        setRoom(nextError.body.room as PrototypeRoom);
      }
      setError(nextError instanceof Error ? nextError.message : "The action could not be completed.");
    } finally {
      setActionPending(false);
    }
  }, [actionPending, room]);

  const activeUnit = room ? getPrototypeActiveUnit(room) : null;
  const isMyTurn = room?.status === "active" && Boolean(activeUnit && canControlPrototypeUnit(activeUnit, playerId));
  const myUnit = isMyTurn
    ? activeUnit
    : room?.units.find((unit) => unit.ownerId === playerId) || null;
  const myMember = room?.members.find((member) => member.playerId === playerId) || null;
  const reachable = useMemo(() => {
    if (!room || !activeUnit || !isMyTurn) return new Set<string>();
    return new Set(getPrototypeReachablePoints(room, activeUnit).map((point) => pointKey(point.x, point.y)));
  }, [activeUnit, isMyTurn, room]);

  const clickCell = (x: number, y: number) => {
    if (!room || !activeUnit || !isMyTurn || actionPending) return;
    const occupant = room.units.find((unit) => unit.hp > 0 && unit.position.x === x && unit.position.y === y);
    if (mode === "attack" && occupant && occupant.team !== activeUnit.team) {
      void dispatch("attack", { targetUnitId: occupant.id });
      return;
    }
    if (mode === "move" && !occupant && reachable.has(pointKey(x, y))) {
      void dispatch("move", { position: { x, y } });
    }
  };

  const ConnectionIcon = connectionView(connection).Icon;
  const selectedSlotCount = invitedIds.length + selectedBotIds.length;

  return (
    <div className="min-h-[620px]" style={{ color: "#C8D6F4" }}>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-[#202653] pb-3">
        <button type="button" onClick={onBack} className={`${retro.button} flex items-center gap-2 px-3 py-1.5 text-[11px]`} style={S_ACCENT}>
          <ArrowLeft size={13} /> Back to Arcade
        </button>
        <div className="flex items-center gap-2 text-[10px]" style={{ color: connectionView(connection).color }}>
          <ConnectionIcon size={13} className={connection === "connecting" ? "animate-spin" : ""} />
          {connectionView(connection).label}
        </div>
      </div>

      {error && (
        <div className="mb-4 flex items-start justify-between gap-3 border border-[#713447] bg-[#2A101A] px-3 py-2 text-[11px]" style={S_RED}>
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)} title="Dismiss" className="shrink-0"><X size={14} /></button>
        </div>
      )}

      <div className="grid min-h-[520px] grid-cols-1 gap-4 lg:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="flex flex-col" style={PANEL}>
          <div className="flex items-center justify-between border-b border-[#23295A] px-3 py-2">
            <div className="flex items-center gap-2 text-[11px] font-bold" style={S_ACCENT}><Users size={13} /> ROOMS</div>
            <button type="button" onClick={() => void refreshOverview()} title="Refresh rooms" className={`${retro.button} p-1.5`} style={S_MUTED}>
              <RefreshCw size={12} />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-2">
            {loading ? (
              <div className="flex items-center gap-2 p-3 text-[10px]" style={S_DIM}><LoaderCircle size={13} className="animate-spin" /> Loading rooms...</div>
            ) : rooms.length === 0 ? (
              <div className="p-3 text-[10px] leading-5" style={S_DIM}>
                {isDM ? "No open prototype rooms." : "No Adventure invitations are waiting for this profile."}
              </div>
            ) : rooms.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => {
                  setRoom(null);
                  setSelectedRoomId(entry.id);
                }}
                className="mb-2 w-full border px-3 py-2 text-left"
                style={{
                  borderColor: selectedRoomId === entry.id ? "#4F8DFF" : "#1B214A",
                  background: selectedRoomId === entry.id ? "#101D42" : "#070A20",
                }}
              >
                <div className="truncate text-[11px] font-bold" style={S_TEXT}>{entry.name}</div>
                <div className="mt-1 flex items-center justify-between gap-2 text-[9px]">
                  <span style={{ color: statusColor(entry.status) }}>{entry.status.toUpperCase()}</span>
                  <span style={S_DIM}>v{entry.version}</span>
                </div>
              </button>
            ))}
          </div>
          {selectedRoomId && (
            <button type="button" onClick={() => setSelectedRoomId(null)} className="m-2 border border-[#28305F] px-3 py-2 text-[10px]" style={S_MUTED}>
              Room list
            </button>
          )}
        </aside>

        <main className="min-w-0">
          {!room ? (
            isDM ? (
              <section className="mx-auto max-w-2xl" style={PANEL}>
                <div className="border-b border-[#23295A] px-5 py-4">
                  <div className="flex items-center gap-2 text-[15px] font-bold" style={S_TEXT}><Plus size={16} style={S_ACCENT} /> Create Prototype Room</div>
                  <div className="mt-1 text-[10px]" style={S_DIM}>Build a test party from invited profiles and reusable DM-controlled bots.</div>
                </div>
                <div className="space-y-5 p-5">
                  <label className="block text-[10px]" style={S_MUTED}>
                    ROOM NAME
                    <input
                      value={roomName}
                      onChange={(event) => setRoomName(event.target.value.slice(0, 80))}
                      className="mt-2 w-full border border-[#2B356B] bg-[#05081C] px-3 py-2 text-[12px] outline-none focus:border-[#4F8DFF]"
                      style={S_TEXT}
                    />
                  </label>
                  <div>
                    <div className="mb-2 flex items-center justify-between text-[10px]" style={S_MUTED}>
                      <span>INVITED PLAYERS</span><span>{selectedSlotCount}/6 SLOTS</span>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {profiles.map((profile) => {
                        const selected = invitedIds.includes(profile.id);
                        return (
                          <button
                            key={profile.id}
                            type="button"
                            onClick={() => setInvitedIds((current) => selected
                              ? current.filter((id) => id !== profile.id)
                              : current.length + selectedBotIds.length < 6 ? [...current, profile.id] : current)}
                            className="flex items-center justify-between border px-3 py-2 text-left text-[11px]"
                            style={{ borderColor: selected ? "#3E9B70" : "#252D5B", background: selected ? "#0C2A20" : "#070A20", color: selected ? "#7DE5B2" : "#A6B2D4" }}
                          >
                            <span className="truncate">{profile.name}</span>{selected ? <Check size={13} /> : <UserPlus size={13} />}
                          </button>
                        );
                      })}
                    </div>
                    {profiles.length === 0 && <div className="border border-[#252D5B] p-3 text-[10px]" style={S_DIM}>No player profiles are available.</div>}
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between text-[10px]" style={S_MUTED}>
                      <span className="flex items-center gap-1.5"><Bot size={12} /> BOT PLAYERS</span>
                      <span>{selectedBotIds.length} SELECTED</span>
                    </div>
                    <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto] gap-2">
                      <input
                        value={botName}
                        onChange={(event) => setBotName(event.target.value.slice(0, 40))}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") {
                            event.preventDefault();
                            void addBot();
                          }
                        }}
                        placeholder="New bot name"
                        aria-label="New bot name"
                        className="min-w-0 border border-[#2B356B] bg-[#05081C] px-3 py-2 text-[11px] outline-none focus:border-[#4F8DFF]"
                        style={S_TEXT}
                      />
                      <button
                        type="button"
                        onClick={() => void addBot()}
                        disabled={!botName.trim() || botBusy}
                        className={`${retro.button} flex min-w-24 items-center justify-center gap-2 px-3 text-[10px] disabled:opacity-40`}
                        style={S_ACCENT}
                      >
                        {botBusy ? <LoaderCircle size={12} className="animate-spin" /> : <Plus size={12} />} Add Bot
                      </button>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {bots.map((bot) => {
                        const selected = selectedBotIds.includes(bot.id);
                        return (
                          <div key={bot.id} className="grid grid-cols-[minmax(0,1fr)_auto] border" style={{ borderColor: selected ? "#A87835" : "#252D5B", background: selected ? "#2B210E" : "#070A20" }}>
                            <button
                              type="button"
                              onClick={() => setSelectedBotIds((current) => selected
                                ? current.filter((id) => id !== bot.id)
                                : current.length + invitedIds.length < 6 ? [...current, bot.id] : current)}
                              className="flex min-w-0 items-center justify-between gap-2 px-3 py-2 text-left text-[11px]"
                              style={{ color: selected ? "#FFD58A" : "#A6B2D4" }}
                            >
                              <span className="flex min-w-0 items-center gap-2"><Bot size={13} className="shrink-0" /><span className="truncate">{bot.name}</span></span>
                              {selected && <Check size={13} className="shrink-0" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => void removeBot(bot)}
                              disabled={deletingBotId === bot.id}
                              title={`Delete ${bot.name}`}
                              aria-label={`Delete bot ${bot.name}`}
                              className="border-l border-[#252D5B] px-2 disabled:opacity-40"
                              style={S_RED}
                            >
                              {deletingBotId === bot.id ? <LoaderCircle size={12} className="animate-spin" /> : <Trash2 size={12} />}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    {bots.length === 0 && <div className="border border-[#252D5B] p-3 text-[10px]" style={S_DIM}>No bot players have been created.</div>}
                  </div>
                  <button
                    type="button"
                    onClick={() => void createRoom()}
                    disabled={creating || selectedSlotCount === 0}
                    className={`${retro.button} flex w-full items-center justify-center gap-2 py-2.5 text-[11px] disabled:cursor-not-allowed disabled:opacity-40`}
                    style={S_GREEN}
                  >
                    {creating ? <LoaderCircle size={14} className="animate-spin" /> : <Plus size={14} />}
                    {creating ? "Creating..." : "Create Room"}
                  </button>
                </div>
              </section>
            ) : (
              <div className="flex min-h-[420px] flex-col items-center justify-center gap-3 border border-[#23295A] bg-[#080B22] p-8 text-center">
                <Shield size={30} style={S_DIM} />
                <div className="text-[13px]" style={S_TEXT}>No room selected</div>
                <div className="max-w-sm text-[10px] leading-5" style={S_DIM}>When the DM invites this profile, the room appears in the list automatically.</div>
              </div>
            )
          ) : (
            <RoomView
              room={room}
              playerId={playerId}
              isDM={isDM}
              myMemberJoined={Boolean(myMember?.joinedAt)}
              myUnitId={myUnit?.id || null}
              activeUnitId={activeUnit?.id || null}
              isMyTurn={Boolean(isMyTurn)}
              mode={mode}
              setMode={setMode}
              reachable={reachable}
              actionPending={actionPending}
              onCell={clickCell}
              dispatch={dispatch}
            />
          )}
        </main>
      </div>
    </div>
  );
}

function RoomView(props: {
  room: PrototypeRoom;
  playerId: string;
  isDM: boolean;
  myMemberJoined: boolean;
  myUnitId: string | null;
  activeUnitId: string | null;
  isMyTurn: boolean;
  mode: BoardMode;
  setMode: (mode: BoardMode) => void;
  reachable: Set<string>;
  actionPending: boolean;
  onCell: (x: number, y: number) => void;
  dispatch: (type: Parameters<typeof sendPrototypeAction>[1], payload?: Parameters<typeof sendPrototypeAction>[2]) => Promise<void>;
}) {
  const { room } = props;
  const activeUnit = room.units.find((unit) => unit.id === props.activeUnitId) || null;
  const myUnit = room.units.find((unit) => unit.id === props.myUnitId) || null;
  const livingPlayers = room.units.filter((unit) => unit.team === "players" && unit.hp > 0);

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-[#23295A] pb-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-[18px] font-bold" style={S_TEXT}>{room.name}</h2>
            <span className="border px-2 py-0.5 text-[9px]" style={{ borderColor: statusColor(room.status), color: statusColor(room.status) }}>{room.status.toUpperCase()}</span>
          </div>
          <div className="mt-1 text-[10px]" style={S_DIM}>Round {room.round} | Version {room.version} | {room.members.length} party slot{room.members.length === 1 ? "" : "s"}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          {room.status === "lobby" && !props.isDM && !props.myMemberJoined && (
            <button type="button" disabled={props.actionPending} onClick={() => void props.dispatch("join")} className={`${retro.button} flex items-center gap-2 px-3 py-2 text-[10px]`} style={S_GREEN}>
              <UserPlus size={13} /> Join Room
            </button>
          )}
          {room.status === "lobby" && props.isDM && (
            <button type="button" disabled={props.actionPending || !room.members.some((member) => member.joinedAt)} onClick={() => void props.dispatch("start")} className={`${retro.button} flex items-center gap-2 px-3 py-2 text-[10px] disabled:opacity-40`} style={S_GREEN}>
              <Play size={13} /> Start Encounter
            </button>
          )}
          {room.status === "active" && props.isDM && (
            <button type="button" disabled={props.actionPending} onClick={() => void props.dispatch("skip_turn")} className={`${retro.button} flex items-center gap-2 px-3 py-2 text-[10px]`} style={S_WARN}>
              <SkipForward size={13} /> Skip Turn
            </button>
          )}
          {props.isDM && room.status !== "closed" && (
            <button type="button" disabled={props.actionPending} onClick={() => void props.dispatch("close")} className={`${retro.button} flex items-center gap-2 px-3 py-2 text-[10px]`} style={S_RED}>
              <DoorClosed size={13} /> Close
            </button>
          )}
        </div>
      </header>

      {room.status === "lobby" ? (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_300px]">
          <section className="p-4" style={PANEL}>
            <div className="mb-3 text-[11px] font-bold" style={S_ACCENT}>INVITED PARTY</div>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {room.members.map((member) => (
                <div key={member.playerId} className="flex items-center justify-between gap-3 border border-[#222A56] bg-[#070A20] px-3 py-3">
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-2">
                      <div className="truncate text-[11px]" style={S_TEXT}>{member.displayName}</div>
                      {member.kind === "bot" && (
                        <span className="flex shrink-0 items-center gap-1 border border-[#8B642E] bg-[#2B210E] px-1.5 py-0.5 text-[8px]" style={S_WARN}>
                          <Bot size={9} /> BOT
                        </span>
                      )}
                    </div>
                    {member.playerId === props.playerId && <div className="mt-1 text-[8px]" style={S_ACCENT}>THIS PROFILE</div>}
                    {member.kind === "bot" && <div className="mt-1 text-[8px]" style={S_DIM}>DM CONTROLLED</div>}
                  </div>
                  <span className="flex items-center gap-1 text-[9px]" style={member.joinedAt ? S_GREEN : S_DIM}>
                    {member.joinedAt ? <Check size={11} /> : <LoaderCircle size={11} />} {member.kind === "bot" ? "READY" : member.joinedAt ? "JOINED" : "INVITED"}
                  </span>
                </div>
              ))}
            </div>
          </section>
          <section className="p-4" style={SUB_PANEL}>
            <div className="mb-2 text-[11px] font-bold" style={S_TEXT}>Prototype Rules</div>
            <div className="space-y-2 text-[10px] leading-5" style={S_DIM}>
              <div>Each unit begins with 12 HP.</div>
              <div>Move up to 3 spaces per turn.</div>
              <div>Basic attacks deal 3 damage at adjacent range.</div>
              <div>The player team acts against the DM Unit.</div>
              <div>Bot turns are played by the DM and follow the same rules.</div>
            </div>
          </section>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(440px,680px)_minmax(260px,1fr)]">
          <section>
            <div className="mb-3 flex min-h-12 flex-wrap items-center justify-between gap-2 border border-[#242D60] bg-[#0B1030] px-3 py-2">
              <div className="text-[11px]">
                <span style={S_DIM}>ACTIVE: </span>
                <span style={activeUnit?.team === "dm" ? S_RED : S_ACCENT}>{activeUnit?.name || "Encounter complete"}</span>
                {props.isMyTurn && <span className="ml-2" style={S_GREEN}>YOUR TURN</span>}
              </div>
              {room.status === "completed" && (
                <div className="flex items-center gap-2 text-[11px]" style={S_WARN}><Swords size={13} /> {room.winner === "players" ? "PLAYERS WIN" : "DM WINS"}</div>
              )}
            </div>

            <div
              className="grid w-full overflow-hidden border border-[#313A72] bg-[#050718]"
              style={{ gridTemplateColumns: `repeat(${room.board.width}, minmax(0, 1fr))`, aspectRatio: `${room.board.width} / ${room.board.height}` }}
            >
              {Array.from({ length: room.board.width * room.board.height }, (_, index) => {
                const x = index % room.board.width;
                const y = Math.floor(index / room.board.width);
                const key = pointKey(x, y);
                const blocked = room.board.blocked.some((point) => point.x === x && point.y === y);
                const unit = room.units.find((entry) => entry.hp > 0 && entry.position.x === x && entry.position.y === y);
                const attackable = props.mode === "attack" && props.isMyTurn && unit && activeUnit && unit.team !== activeUnit.team && Math.abs(unit.position.x - activeUnit.position.x) + Math.abs(unit.position.y - activeUnit.position.y) === 1;
                const moveable = props.mode === "move" && props.isMyTurn && props.reachable.has(key);
                const isActive = unit?.id === props.activeUnitId;
                return (
                  <button
                    type="button"
                    key={key}
                    onClick={() => props.onCell(x, y)}
                    disabled={blocked || props.actionPending}
                    title={blocked ? "Blocked space" : unit ? `${unit.name}: ${unit.hp}/${unit.maxHp} HP` : `Grid ${x + 1}, ${y + 1}`}
                    aria-label={blocked ? `Blocked grid space ${x + 1}, ${y + 1}` : unit ? `${unit.name}, ${unit.hp} health` : `Empty grid space ${x + 1}, ${y + 1}`}
                    className="relative flex min-h-0 items-center justify-center border border-[#151A3A] p-1 disabled:cursor-default"
                    style={{
                      background: blocked
                        ? "repeating-linear-gradient(135deg, #151832 0, #151832 5px, #0A0D22 5px, #0A0D22 10px)"
                        : attackable ? "#351221" : moveable ? "#0D2D2A" : (x + y) % 2 === 0 ? "#0B0F2B" : "#080B22",
                      boxShadow: isActive ? "inset 0 0 0 2px #FFD56A" : attackable ? "inset 0 0 0 2px #F47A91" : moveable ? "inset 0 0 0 1px #3DAE87" : "none",
                    }}
                  >
                    {unit && (
                      <div
                        className="flex h-[72%] w-[72%] max-h-12 max-w-12 items-center justify-center border text-[12px] font-bold"
                        style={{
                          borderColor: unit.team === "dm" ? "#F47A91" : unit.isBot ? "#D7A24A" : "#79B8FF",
                          background: unit.team === "dm" ? "#481528" : unit.isBot ? "#3B2A0D" : "#112E58",
                          color: unit.team === "dm" ? "#FFB0BE" : unit.isBot ? "#FFE0A3" : "#B9D9FF",
                        }}
                      >
                        {unit.team === "dm" ? "DM" : unit.name.slice(0, 2).toUpperCase()}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-3 grid grid-cols-[1fr_1fr_auto] gap-2">
              <button type="button" onClick={() => props.setMode("move")} disabled={!props.isMyTurn || !myUnit || myUnit.moveRemaining <= 0} className="flex min-h-10 items-center justify-center gap-2 border px-3 text-[10px] disabled:opacity-35" style={{ borderColor: props.mode === "move" ? "#54C7A0" : "#2A3263", background: props.mode === "move" ? "#0D2D2A" : "#090D27", color: props.mode === "move" ? "#76E5BB" : "#8E9ABB" }}>
                <Move size={14} /> Move {myUnit ? `(${myUnit.moveRemaining})` : ""}
              </button>
              <button type="button" onClick={() => props.setMode("attack")} disabled={!props.isMyTurn || !myUnit || myUnit.actionTaken} className="flex min-h-10 items-center justify-center gap-2 border px-3 text-[10px] disabled:opacity-35" style={{ borderColor: props.mode === "attack" ? "#D75D77" : "#2A3263", background: props.mode === "attack" ? "#351221" : "#090D27", color: props.mode === "attack" ? "#FF9AAF" : "#8E9ABB" }}>
                <Crosshair size={14} /> Attack
              </button>
              <button type="button" onClick={() => void props.dispatch("end_turn")} disabled={!props.isMyTurn || props.actionPending} title="End turn" className={`${retro.button} flex min-h-10 items-center justify-center px-3 disabled:opacity-35`} style={S_WARN}>
                <SkipForward size={15} />
              </button>
            </div>
          </section>

          <aside className="grid min-h-0 grid-rows-[auto_minmax(180px,1fr)] gap-4">
            <section className="p-3" style={PANEL}>
              <div className="mb-3 text-[10px] font-bold" style={S_ACCENT}>UNITS</div>
              <div className="space-y-2">
                {room.units.map((unit) => {
                  const hpPercent = Math.max(0, (unit.hp / unit.maxHp) * 100);
                  return (
                    <div key={unit.id} className="border border-[#202753] bg-[#070A20] p-2">
                      <div className="mb-1 flex items-center justify-between gap-2 text-[10px]">
                        <span className="flex min-w-0 items-center gap-1.5 truncate" style={unit.team === "dm" ? S_RED : S_TEXT}>
                          {unit.isBot && <Bot size={10} className="shrink-0" style={S_WARN} />}
                          <span className="truncate">{unit.name}{unit.ownerId === props.playerId ? " (You)" : unit.isBot && props.isDM ? " (DM Bot)" : ""}</span>
                        </span>
                        <span style={unit.hp > 0 ? S_GREEN : S_RED}>{unit.hp}/{unit.maxHp}</span>
                      </div>
                      <div className="h-1.5 overflow-hidden bg-[#171B38]"><div className="h-full" style={{ width: `${hpPercent}%`, background: unit.team === "dm" ? "#D75D77" : unit.isBot ? "#D7A24A" : "#4F8DFF" }} /></div>
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 text-[9px]" style={S_DIM}>{livingPlayers.length} player unit{livingPlayers.length === 1 ? "" : "s"} standing</div>
            </section>

            <section className="min-h-0 p-3" style={SUB_PANEL}>
              <div className="mb-2 text-[10px] font-bold" style={S_ACCENT}>ACTION LOG</div>
              <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
                {room.log.map((entry) => (
                  <div key={entry.id} className="border-b border-[#171D40] pb-2 text-[9px] leading-4">
                    <div style={S_TEXT}>{entry.message}</div>
                    <div style={S_DIM}>{formatTime(entry.at)}</div>
                  </div>
                ))}
              </div>
            </section>
          </aside>
        </div>
      )}
    </div>
  );
}

export default AdventurePrototype;
