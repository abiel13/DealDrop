import { Input } from "./Input";
import type { InputProps } from "./Input";

export function SearchBar(props: Omit<InputProps, "label">) {
  return <Input placeholder="Search..." returnKeyType="search" {...props} />;
}
