import "@testing-library/jest-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import App from "./App";

const friends = [
  { id: "1", name: "Clark", image: "https://example.test/clark.png", balance: -7 },
];

function mockResponse(data, ok = true) {
  return Promise.resolve({ ok, json: () => Promise.resolve(data) });
}

beforeEach(() => {
  global.fetch = jest.fn(() => mockResponse(friends));
});

afterEach(() => {
  jest.restoreAllMocks();
});

test("loads friends from the API", async () => {
  render(<App />);
  expect(screen.getByRole("status")).toHaveTextContent("Loading friends");
  expect(await screen.findByText("Clark")).toBeInTheDocument();
  expect(global.fetch).toHaveBeenCalledWith("/api/friends", expect.any(Object));
});

test("shows local validation when adding a friend without a name", async () => {
  render(<App />);
  await screen.findByText("Clark");
  fireEvent.click(screen.getByRole("button", { name: "Add friend" }));
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  expect(screen.getByRole("alert")).toHaveTextContent("A friend name is required.");
});

test("adds a friend through the API", async () => {
  global.fetch
    .mockImplementationOnce(() => mockResponse(friends))
    .mockImplementationOnce(() => mockResponse({ id: "2", name: "Mina", image: "https://example.test/mina.png", balance: 0 }));
  render(<App />);
  await screen.findByText("Clark");
  fireEvent.click(screen.getByRole("button", { name: "Add friend" }));
  fireEvent.change(screen.getByLabelText(/friend name/i), { target: { value: "Mina" } });
  fireEvent.change(screen.getByLabelText(/image url/i), { target: { value: "https://example.test/mina.png" } });
  fireEvent.click(screen.getByRole("button", { name: "Add" }));
  expect(await screen.findByText("Mina")).toBeInTheDocument();
  await waitFor(() => expect(global.fetch).toHaveBeenLastCalledWith(
    "/api/friends",
    expect.objectContaining({ method: "POST" })
  ));
});
