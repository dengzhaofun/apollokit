/**
 * Sidebar for the platform-operator surface (`/admin/*`).
 *
 * Standalone — does NOT reuse `AppSidebar`. The tenant sidebar's
 * org/project switcher, capability-driven business module list, and
 * search palette are all tenant-scoped and don't apply here. Keeping
 * the components separate avoids a sea of `if (variant === ...)`
 * branches and means the platform side can evolve independently
 * (e.g. add a "Billing summary" section) without risk of leaking
 * platform nav into tenant menus.
 *
 * Components used (avatar / dropdown / sidebar primitives) are the
 * same shadcn + radix-based pieces under `components/ui/*`.
 */

import { Link, useNavigate } from "@tanstack/react-router"
import { BarChart3, LogOut, ArrowLeftRight } from "lucide-react"

import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "./ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "./ui/dropdown-menu"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "./ui/sidebar"
import { authClient } from "../lib/auth-client"
import { cn } from "../lib/utils"
import * as m from "../paraglide/messages.js"

export function AdminSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={
                <Link to="/admin/mau">
                  <div className="flex aspect-square size-8 items-center justify-center overflow-hidden rounded-lg">
                    <img
                      src="/logo192.png"
                      alt={m.admin_brand()}
                      className="size-full object-contain"
                    />
                  </div>
                  <div className="flex flex-col gap-0.5 leading-none group-data-[collapsible=icon]:hidden">
                    <span className="font-semibold">{m.admin_brand()}</span>
                    <span className="text-xs text-muted-foreground">
                      {m.admin_brand_subtitle()}
                    </span>
                  </div>
                </Link>
              }
              size="lg"
              tooltip={m.admin_brand()}
            />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={
                    <Link to="/admin/mau">
                      <BarChart3 className="size-4" />
                      <span>{m.nav_admin_mau()}</span>
                    </Link>
                  }
                  tooltip={m.nav_admin_mau()}
                />
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <AdminUserMenuButton />
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}

/**
 * Lightweight user menu for the admin layout. Kept separate from the
 * tenant `UserMenuButton` (in `AppSidebar.tsx`) because the surfaces
 * differ:
 *   - "My workspace" navigates back to the tenant view at `/`,
 *     letting the root index handle the redirect to the user's
 *     active org/project.
 *   - No theme/language sub-menus here (admin surface keeps it
 *     minimal; user menus on the tenant side already expose those).
 */
function AdminUserMenuButton() {
  const navigate = useNavigate()
  const { data: session } = authClient.useSession()
  const user = session?.user
  const displayName = user?.name?.trim() || user?.email || ""
  const initials =
    (user?.name?.trim() || user?.email || "?")
      .split(/\s+/)
      .map((s) => s[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "?"

  const handleSignOut = async () => {
    await authClient.signOut()
    navigate({ to: "/" })
  }

  const handleMyWorkspace = () => {
    // Land on the marketing root — its `beforeLoad` redirects logged-in
    // users to their default `/o/.../p/.../dashboard`. This avoids us
    // having to re-derive the active org / team slug from session.
    navigate({ to: "/" })
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            className={cn(
              "flex w-full items-center gap-2 rounded-md px-2 py-1.5 outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
            )}
          >
            <Avatar size="default">
              {user?.image ? (
                <AvatarImage src={user.image} alt={displayName} />
              ) : null}
              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
            <div className="flex min-w-0 flex-1 flex-col items-start text-left group-data-[collapsible=icon]:hidden">
              <span className="truncate text-sm font-medium">
                {user?.name?.trim() || user?.email || ""}
              </span>
              {user?.email && user?.name?.trim() ? (
                <span className="truncate text-xs text-muted-foreground">
                  {user.email}
                </span>
              ) : null}
            </div>
          </button>
        }
      />
      <DropdownMenuContent side="top" align="start" className="min-w-[14rem]">
        <DropdownMenuItem onClick={handleMyWorkspace}>
          <ArrowLeftRight className="size-4" />
          <span>{m.user_menu_my_workspace()}</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onClick={handleSignOut}>
          <LogOut className="size-4" />
          <span>{m.user_menu_sign_out()}</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
