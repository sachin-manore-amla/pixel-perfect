import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChevronDown } from "lucide-react";

interface SelectedProjectsFilterDropdownProps {
  availableProjectKeys: string[];
  selectedProjectKeys: string[];
  onSelectionChange: (keys: string[]) => void;
}

export function SelectedProjectsFilterDropdown({
  availableProjectKeys,
  selectedProjectKeys,
  onSelectionChange,
}: SelectedProjectsFilterDropdownProps) {
  const [localSelected, setLocalSelected] = useState<Set<string>>(new Set(selectedProjectKeys));

  useEffect(() => {
    setLocalSelected(new Set(selectedProjectKeys));
  }, [selectedProjectKeys]);

  const sortedAvailable = useMemo(
    () => [...availableProjectKeys].sort((a, b) => a.localeCompare(b)),
    [availableProjectKeys]
  );

  const allSelected = sortedAvailable.length > 0 && localSelected.size === sortedAvailable.length;

  const applySelection = (next: Set<string>) => {
    setLocalSelected(next);
    onSelectionChange(Array.from(next));
  };

  const toggleProject = (key: string) => {
    const next = new Set(localSelected);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    if (next.size === 0) {
      sortedAvailable.forEach((k) => next.add(k));
    }
    applySelection(next);
  };

  const toggleSelectAll = () => {
    if (allSelected) {
      const keepOne = sortedAvailable[0] ? [sortedAvailable[0]] : [];
      applySelection(new Set(keepOne));
      return;
    }
    applySelection(new Set(sortedAvailable));
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-9 text-xs">
          Projects ({localSelected.size}/{sortedAvailable.length})
          <ChevronDown className="ml-2 h-3.5 w-3.5" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-60" align="end">
        <DropdownMenuLabel className="text-xs">Filter by selected projects</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuCheckboxItem
          checked={allSelected}
          onCheckedChange={toggleSelectAll}
          onSelect={(e) => e.preventDefault()}
          className="data-[state=checked]:text-success data-[state=checked]:bg-success/10"
        >
          Select all
        </DropdownMenuCheckboxItem>
        <DropdownMenuSeparator />
        {sortedAvailable.map((key) => (
          <DropdownMenuCheckboxItem
            key={key}
            checked={localSelected.has(key)}
            onCheckedChange={() => toggleProject(key)}
            onSelect={(e) => e.preventDefault()}
            className="data-[state=checked]:text-success data-[state=checked]:bg-success/10"
          >
            {key}
          </DropdownMenuCheckboxItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
