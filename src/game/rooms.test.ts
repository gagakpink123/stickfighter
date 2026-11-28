import test from 'node:test';
import assert from 'node:assert/strict';
import { RoomDirectory, sanitizeRoomName, validateRoomName } from './rooms';

test('Room name sanitizer and validator clean input and enforce min/max length', () => {
  assert.equal(sanitizeRoomName('  Ruang   Tamu \n Seru  '), 'Ruang Tamu Seru');
  assert.equal(validateRoomName('   A   ').ok, false);
  const ok = validateRoomName('  Duel Keluarga 99  ');
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.name, 'Duel Keluarga 99');
  }
  const long = validateRoomName('X'.repeat(45));
  assert.equal(long.ok, true);
  if (long.ok) {
    assert.equal(long.name.length, 28);
  }
});

test('Creating a room lists it in active waiting rooms and rejects duplicate waiting names', () => {
  const dir = new RoomDirectory();
  const res1 = dir.createRoom('c1', 'Ruang Tamu Adnan', 100);
  assert.equal(res1.ok, true);
  if (!res1.ok) return;

  const list = dir.getWaitingRooms();
  assert.equal(list.length, 1);
  assert.equal(list[0].name, 'Ruang Tamu Adnan');
  assert.equal(list[0].status, 'waiting');
  assert.equal(list[0].playerCount, 1);

  const dup = dir.createRoom('c2', '  ruang tamu adnan ');
  assert.equal(dup.ok, false);

  const res2 = dir.createRoom('c2', 'Taman Komplek', 200);
  assert.equal(res2.ok, true);
  const list2 = dir.getWaitingRooms();
  assert.equal(list2.length, 2);
  assert.equal(list2[0].name, 'Taman Komplek');
  assert.equal(list2[1].name, 'Ruang Tamu Adnan');
});

test('Joining a room pairs Host and Guest, removes it from waiting list, and rejects 3rd player', () => {
  const dir = new RoomDirectory();
  const created = dir.createRoom('host-1', 'Dapur Ibu Tika', 100);
  assert.equal(created.ok, true);
  if (!created.ok) return;

  // Host cannot join own room
  const selfJoin = dir.joinRoom('host-1', created.room.id);
  assert.equal(selfJoin.ok, false);

  // Guest joins successfully
  const joined = dir.joinRoom('guest-2', created.room.id);
  assert.equal(joined.ok, true);
  if (joined.ok) {
    assert.equal(joined.hostClientId, 'host-1');
    assert.equal(joined.room.status, 'playing');
    assert.equal(joined.room.playerCount, 2);
  }

  // Room leaves waiting directory once full
  assert.equal(dir.getWaitingRooms().length, 0);
  assert.equal(dir.getPeerClientId('host-1'), 'guest-2');
  assert.equal(dir.getPeerClientId('guest-2'), 'host-1');

  // 3rd player cannot join full room
  const third = dir.joinRoom('guest-3', created.room.id);
  assert.equal(third.ok, false);
});

test('Leaving or disconnecting cleans up room and notifies paired peer', () => {
  const dir = new RoomDirectory();
  const r1 = dir.createRoom('host-a', 'Sekolah Dhira', 100);
  assert.equal(r1.ok, true);
  if (!r1.ok) return;

  // Host cancels while waiting -> waiting list becomes empty
  const cancelRes = dir.leaveClient('host-a');
  assert.equal(cancelRes.listChanged, true);
  assert.equal(cancelRes.notifyPeerId, null);
  assert.equal(dir.getWaitingRooms().length, 0);

  // Host + Guest paired, then Guest disconnects -> notifies Host
  const r2 = dir.createRoom('host-b', 'Kamar Iyen', 200);
  assert.equal(r2.ok, true);
  if (!r2.ok) return;
  dir.joinRoom('guest-b', r2.room.id);
  const dcRes = dir.leaveClient('guest-b');
  assert.equal(dcRes.notifyPeerId, 'host-b');
  assert.equal(dir.getPeerClientId('host-b'), null);
});
