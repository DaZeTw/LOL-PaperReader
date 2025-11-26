"use client"

import { LogOut, User } from "lucide-react"

import { Avatar } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Button } from "@/components/ui/button"
import type { AuthUser } from "@/contexts/AuthContext"
import { useAuth } from "@/hooks/useAuth"

interface UserMenuProps {
  user: Pick<AuthUser, "name" | "email" | "image">
}

export function UserMenu({ user }: UserMenuProps) {
  const { logout } = useAuth()
  const fallback = user.name || user.email || "U"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full">
          <Avatar src={user.image} alt={user.name || "User"} fallback={fallback} className="h-8 w-8" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <div className="flex items-center gap-2 px-2 py-1.5">
          <Avatar src={user.image} alt={user.name || "User"} fallback={fallback} className="h-8 w-8" />
          <div className="flex flex-col space-y-0.5">
            <p className="text-sm font-medium">{user.name || "User"}</p>
            <p className="text-xs text-muted-foreground">{user.email}</p>
          </div>
        </div>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled>
          <User className="mr-2 h-4 w-4" />
          <span>Profile</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() => {
            void logout()
          }}
          className="text-destructive focus:text-destructive"
        >
          <LogOut className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
