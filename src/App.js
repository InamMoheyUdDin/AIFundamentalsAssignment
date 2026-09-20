import { useEffect, useState } from "react";

async function request(url, options) {
  const response = await fetch(url, { headers: { "Content-Type": "application/json" }, ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

function Button({ children, onClick, type = "button" }) {
  return <button className="button" onClick={onClick} type={type}>{children}</button>;
}

export default function App() {
  const [friends, setFriends] = useState([]);
  const [showAddFriend, setShowAddFriend] = useState(false);
  const [selectedFriend, setSelectedFriend] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    request("/api/friends")
      .then((data) => active && setFriends(data))
      .catch((requestError) => active && setError(requestError.message))
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  function handleShowAddFriend() {
    setShowAddFriend((show) => !show);
    setError("");
  }

  async function handleAddFriend(friend) {
    const createdFriend = await request("/api/friends", { method: "POST", body: JSON.stringify(friend) });
    setFriends((currentFriends) => [...currentFriends, createdFriend]);
    setShowAddFriend(false);
  }

  function handleSelection(friend) {
    setSelectedFriend((current) => (current?.id === friend.id ? null : friend));
    setShowAddFriend(false);
    setError("");
  }

  async function handleSplitBill(split) {
    const updatedFriend = await request(`/api/friends/${selectedFriend.id}/splits`, {
      method: "POST", body: JSON.stringify(split),
    });
    setFriends((currentFriends) => currentFriends.map((friend) => (
      friend.id === updatedFriend.id ? updatedFriend : friend
    )));
    setSelectedFriend(null);
  }

  return (
    <div className="app">
      <div className="sidebar">
        {loading && <p className="status" role="status">Loading friends…</p>}
        {error && <p className="error" role="alert">{error}</p>}
        {!loading && !error && <FriendsList friends={friends} selectedFriend={selectedFriend} onSelection={handleSelection} />}
        {showAddFriend && <FormAddFriend onAddFriend={handleAddFriend} />}
        <Button onClick={handleShowAddFriend}>{showAddFriend ? "Close" : "Add friend"}</Button>
      </div>
      {selectedFriend && <FormSplitBill selectedFriend={selectedFriend} onSplitBill={handleSplitBill} />}
    </div>
  );
}

function FriendsList({ friends, onSelection, selectedFriend }) {
  return <ul>{friends.map((friend) => <Friend friend={friend} key={friend.id} selectedFriend={selectedFriend} onSelection={onSelection} />)}</ul>;
}

function Friend({ friend, onSelection, selectedFriend }) {
  const isSelected = selectedFriend?.id === friend.id;
  const balance = Number(friend.balance);
  return (
    <li className={isSelected ? "selected" : ""}>
      <img src={friend.image} alt={friend.name} />
      <h3>{friend.name}</h3>
      {balance < 0 && <p className="red">You owe {friend.name} {formatMoney(-balance)}</p>}
      {balance > 0 && <p className="green">{friend.name} owes you {formatMoney(balance)}</p>}
      {balance === 0 && <p>You and {friend.name} are even</p>}
      <Button onClick={() => onSelection(friend)}>{isSelected ? "Close" : "Select"}</Button>
    </li>
  );
}

function FormAddFriend({ onAddFriend }) {
  const [name, setName] = useState("");
  const [image, setImage] = useState("https://i.pravatar.cc/48");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  async function handleSubmit(event) {
    event.preventDefault();
    if (!name.trim()) return setError("A friend name is required.");
    if (!image.trim()) return setError("An image URL is required.");
    setError(""); setSubmitting(true);
    try { await onAddFriend({ name, image }); }
    catch (requestError) { setError(requestError.message); }
    finally { setSubmitting(false); }
  }
  return (
    <form className="form-add-friend" onSubmit={handleSubmit} noValidate>
      <label htmlFor="friend-name">👫 Friend name</label>
      <input id="friend-name" type="text" value={name} onChange={(event) => setName(event.target.value)} maxLength="80" />
      <label htmlFor="friend-image">🌄 Image URL</label>
      <input id="friend-image" type="url" value={image} onChange={(event) => setImage(event.target.value)} />
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button type="submit">{submitting ? "Adding…" : "Add"}</Button>
    </form>
  );
}

function FormSplitBill({ selectedFriend, onSplitBill }) {
  const [bill, setBill] = useState("");
  const [paidByUser, setPaidByUser] = useState("");
  const [whoIsPaying, setWhoIsPaying] = useState("user");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const billAmount = Number(bill);
  const userAmount = Number(paidByUser);
  const paidByFriend = bill !== "" && paidByUser !== "" && userAmount <= billAmount ? billAmount - userAmount : "";
  async function handleSubmit(event) {
    event.preventDefault();
    if (!Number.isFinite(billAmount) || billAmount <= 0) return setError("Enter a positive bill amount.");
    if (paidByUser === "" || !Number.isFinite(userAmount) || userAmount < 0 || userAmount > billAmount) return setError("Your expense must be between zero and the bill amount.");
    setError(""); setSubmitting(true);
    try { await onSplitBill({ bill: billAmount, paidByUser: userAmount, payer: whoIsPaying }); }
    catch (requestError) { setError(requestError.message); }
    finally { setSubmitting(false); }
  }
  return (
    <form className="form-split-bill" onSubmit={handleSubmit} noValidate>
      <h2>Split a bill with {selectedFriend.name}</h2>
      <label htmlFor="bill">💰 Bill value</label>
      <input id="bill" type="number" min="0.01" step="0.01" value={bill} onChange={(event) => setBill(event.target.value)} />
      <label htmlFor="your-expense">🧍‍♀️ Your expense</label>
      <input id="your-expense" type="number" min="0" step="0.01" value={paidByUser} onChange={(event) => setPaidByUser(event.target.value)} />
      <label htmlFor="friend-expense">👫 {selectedFriend.name}'s expense</label>
      <input id="friend-expense" type="text" disabled value={paidByFriend === "" ? "" : formatMoney(paidByFriend)} />
      <label htmlFor="payer">🤑 Who is paying the bill</label>
      <select id="payer" value={whoIsPaying} onChange={(event) => setWhoIsPaying(event.target.value)}>
        <option value="user">You</option><option value="friend">{selectedFriend.name}</option>
      </select>
      {error && <p className="form-error" role="alert">{error}</p>}
      <Button type="submit">{submitting ? "Saving…" : "Split bill"}</Button>
    </form>
  );
}

function formatMoney(amount) { return `${Number(amount).toFixed(2)}€`; }
