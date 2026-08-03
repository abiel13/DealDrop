import { Input } from "./Input";

export function SearchBar() {
  return (
    <Input
      placeholder="Search..."
      returnKeyType="search"
    />
  );
}