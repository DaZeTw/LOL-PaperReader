# UI Component Hierarchy

## Overview

This document details the React component structure for authentication and corpus management features in LOL-PaperReader.

---

## Application Layout Structure

```
app/
├── layout.tsx (Root Layout)
│   ├── AuthProvider (Context)
│   │   └── CorpusProvider (Context)
│   │       └── ThemeProvider (Existing)
│   │           └── {children}
│   └── Toaster
│
├── (auth)/                    # Auth Route Group
│   ├── layout.tsx            # Auth layout (centered form)
│   ├── login/
│   │   └── page.tsx          # Login page
│   └── signup/
│       └── page.tsx          # Signup page
│
├── (app)/                     # Protected Route Group
│   ├── layout.tsx            # App layout (nav + sidebar)
│   ├── corpus/
│   │   └── page.tsx          # Corpus management page
│   └── reader/
│       └── page.tsx          # PDF reader (existing, enhanced)
│
└── page.tsx                   # Landing/redirect page
```

---

## Component Tree

### 1. Authentication Components

#### LoginPage (`app/(auth)/login/page.tsx`)
```
LoginPage
├── Card
│   ├── CardHeader
│   │   ├── Logo/Title
│   │   └── CardDescription
│   │
│   ├── CardContent
│   │   └── LoginForm
│   │       ├── EmailInput (label, Input, error message)
│   │       ├── PasswordInput (label, Input, show/hide toggle, error)
│   │       ├── RememberMeCheckbox
│   │       ├── ForgotPasswordLink (future)
│   │       └── SubmitButton (loading state)
│   │
│   └── CardFooter
│       └── SignupLink ("Don't have an account?")
│
└── ErrorToast (via useToast)
```

**Props Interface:**
```typescript
interface LoginFormData {
  email: string
  password: string
  remember_me: boolean
}

interface LoginPageProps {
  searchParams?: { redirect?: string }
}
```

#### SignupPage (`app/(auth)/signup/page.tsx`)
```
SignupPage
├── Card
│   ├── CardHeader
│   │   ├── Logo/Title ("Create Account")
│   │   └── CardDescription
│   │
│   ├── CardContent
│   │   └── SignupForm
│   │       ├── NameInput
│   │       ├── EmailInput
│   │       ├── PasswordInput (with strength indicator)
│   │       ├── ConfirmPasswordInput
│   │       ├── TermsCheckbox
│   │       └── SubmitButton (loading state)
│   │
│   └── CardFooter
│       └── LoginLink ("Already have an account?")
│
└── PasswordStrengthIndicator
    ├── ProgressBar
    └── RequirementsList (8+ chars, uppercase, number, etc.)
```

**Props Interface:**
```typescript
interface SignupFormData {
  name: string
  email: string
  password: string
  confirm_password: string
  accept_terms: boolean
}
```

---

### 2. Corpus Management Components

#### CorpusPage (`app/(app)/corpus/page.tsx`)
```
CorpusPage
├── PageHeader
│   ├── Title ("My Corpus Library")
│   ├── Subtitle (stats: X corpora, Y documents)
│   └── Actions
│       ├── NewCorpusButton
│       └── SettingsButton
│
├── CorpusGrid (or CorpusList)
│   └── CorpusCard[] (mapped from corpus array)
│       ├── CardHeader
│       │   ├── CorpusIcon
│       │   ├── CorpusName
│       │   └── CorpusMenu (edit, delete, share)
│       │
│       ├── CardContent
│       │   ├── Description
│       │   ├── Stats (documents: N, size: XMB)
│       │   ├── Tags[]
│       │   └── LastModified
│       │
│       └── CardFooter
│           ├── OpenButton ("Open Corpus")
│           └── UploadButton ("Add Documents")
│
├── EmptyState (when no corpora)
│   ├── EmptyIcon
│   ├── Message ("No corpus yet")
│   └── CreateFirstButton
│
└── Modals
    ├── NewCorpusDialog
    ├── EditCorpusDialog
    └── DeleteConfirmDialog
```

**State Management:**
```typescript
interface CorpusPageState {
  corpora: Corpus[]
  loading: boolean
  selectedCorpus: Corpus | null
  showNewDialog: boolean
  showEditDialog: boolean
  showDeleteDialog: boolean
}

interface Corpus {
  id: string
  user_id: string
  name: string
  description?: string
  document_count: number
  total_size_bytes: number
  created_at: string
  updated_at: string
  tags: string[]
}
```

#### CorpusCard (`components/corpus/corpus-card.tsx`)
```
CorpusCard
├── Card (hover effects, click to open)
│   ├── CardHeader
│   │   ├── FolderIcon (dynamic based on corpus type)
│   │   ├── Title
│   │   └── DropdownMenu
│   │       ├── Edit
│   │       ├── Duplicate
│   │       ├── Share (future)
│   │       ├── Separator
│   │       └── Delete (danger variant)
│   │
│   ├── CardContent
│   │   ├── Description (truncated, tooltip on hover)
│   │   ├── StatsRow
│   │   │   ├── DocumentIcon + Count
│   │   │   ├── SizeIcon + Size
│   │   │   └── DateIcon + Last Modified
│   │   │
│   │   └── TagsRow
│   │       └── Badge[] (max 3 visible, +N more)
│   │
│   └── CardFooter
│       ├── Button ("Open", primary)
│       └── Button ("Upload", secondary)
```

**Props:**
```typescript
interface CorpusCardProps {
  corpus: Corpus
  onOpen: (corpusId: string) => void
  onEdit: (corpus: Corpus) => void
  onDelete: (corpusId: string) => void
  onUpload: (corpusId: string) => void
}
```

#### NewCorpusDialog (`components/corpus/new-corpus-dialog.tsx`)
```
NewCorpusDialog
├── Dialog
│   ├── DialogTrigger (external)
│   │
│   └── DialogContent
│       ├── DialogHeader
│       │   ├── DialogTitle ("Create New Corpus")
│       │   └── DialogDescription
│       │
│       ├── Form
│       │   ├── NameInput (required, max 100 chars)
│       │   ├── DescriptionTextarea (optional, max 500 chars)
│       │   ├── TagsInput (comma-separated or chip input)
│       │   └── ColorPicker (optional, for visual distinction)
│       │
│       └── DialogFooter
│           ├── CancelButton
│           └── CreateButton (disabled until valid)
```

**Form Validation:**
```typescript
interface NewCorpusFormData {
  name: string           // Required, 1-100 chars
  description?: string   // Optional, max 500 chars
  tags?: string[]        // Optional
  color?: string         // Optional, hex color
}

const validationRules = {
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  tags: z.array(z.string()).max(10).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional()
}
```

#### CorpusDocumentList (`components/corpus/corpus-document-list.tsx`)
```
CorpusDocumentList
├── Header
│   ├── Title ("Documents in {corpus.name}")
│   ├── SearchInput (filter documents)
│   └── UploadButton
│
├── Toolbar
│   ├── SortDropdown (name, date, size)
│   ├── ViewToggle (grid/list)
│   └── SelectAllCheckbox (bulk actions)
│
├── DocumentGrid (or DocumentList)
│   └── DocumentCard[] (mapped)
│       ├── Thumbnail (PDF first page)
│       ├── FileName
│       ├── FileSize
│       ├── UploadDate
│       ├── Status (ready/processing/failed)
│       └── Actions
│           ├── Open (navigate to reader)
│           ├── Download
│           ├── Remove from corpus
│
├── Pagination
│   ├── PreviousButton
│   ├── PageIndicator (1-10 of 234)
│   └── NextButton
│
└── EmptyState (no documents)
    ├── EmptyIcon
    └── UploadPrompt
```

---

### 3. Navigation Components

#### AppHeader (`components/layout/app-header.tsx`)
```
AppHeader
├── Container
│   ├── LeftSection
│   │   ├── Logo (click → /corpus)
│   │   └── NavLinks
│   │       ├── Link ("Corpus", active state)
│   │       ├── Link ("Reader", disabled if no corpus selected)
│   │       └── Link ("History")
│   │
│   ├── CenterSection
│   │   └── GlobalSearch (future: search across all documents)
│   │
│   └── RightSection
│       ├── NotificationBell (future)
│       ├── ThemeToggle (existing)
│       └── UserMenu
│           ├── Avatar (profile picture or initials)
│           └── DropdownMenu
│               ├── Profile
│               ├── Settings
│               ├── Help
│               ├── Separator
│               └── Logout
```

**Props:**
```typescript
interface AppHeaderProps {
  user: User
  activeCorpus?: Corpus | null
}

interface User {
  id: string
  name: string
  email: string
  profile_picture?: string
}
```

#### UserMenu (`components/layout/user-menu.tsx`)
```
UserMenu
├── DropdownMenu
│   ├── DropdownMenuTrigger
│   │   └── Avatar
│   │       ├── AvatarImage (src={user.profile_picture})
│   │       └── AvatarFallback (initials)
│   │
│   └── DropdownMenuContent
│       ├── DropdownMenuLabel
│       │   ├── UserName
│       │   └── UserEmail (muted)
│       │
│       ├── DropdownMenuSeparator
│       │
│       ├── DropdownMenuItem ("Profile", icon=User)
│       ├── DropdownMenuItem ("Settings", icon=Settings)
│       ├── DropdownMenuItem ("Keyboard Shortcuts", icon=Keyboard)
│       ├── DropdownMenuItem ("Help & Feedback", icon=HelpCircle)
│       │
│       ├── DropdownMenuSeparator
│       │
│       └── DropdownMenuItem ("Logout", icon=LogOut, variant=danger)
```

---

### 4. Enhanced PDFReader Components

#### EnhancedPDFReader (`components/pdf-reader.tsx` - updated)
```
EnhancedPDFReader (existing component, enhanced)
├── AuthCheck (redirect if not authenticated)
│
├── CorpusContext (access activeCorpus)
│
├── Header
│   ├── Title
│   ├── CorpusBreadcrumb (Corpus > Document)
│   ├── DocumentSelector (dropdown, switch between corpus docs)
│   └── ThemeToggle
│
├── TabBar (enhanced with corpus context)
│   └── Tab[] (now shows corpus association)
│
└── MainContent
    ├── PDFViewer (existing, no changes needed)
    ├── QAInterface (enhanced with corpus context)
    │   └── Uses corpus_id for scoped queries
    └── AnnotationToolbar (existing)
```

**Updated Props:**
```typescript
interface EnhancedPDFReaderProps {
  corpusId?: string          // From URL or context
  documentId?: string        // From URL
  initialFile?: File         // Legacy support
}
```

#### CorpusBreadcrumb (`components/corpus/corpus-breadcrumb.tsx`)
```
CorpusBreadcrumb
├── Breadcrumb
│   ├── BreadcrumbItem
│   │   ├── HomeIcon
│   │   └── Link ("Corpus")
│   │
│   ├── BreadcrumbSeparator
│   │
│   ├── BreadcrumbItem
│   │   └── Link (corpus.name)
│   │
│   ├── BreadcrumbSeparator
│   │
│   └── BreadcrumbItem (current)
│       └── Text (document.name)
```

---

### 5. Shared UI Components (shadcn/ui)

#### Existing Components (reused)
- `Button` - All CTAs and actions
- `Card`, `CardHeader`, `CardContent`, `CardFooter` - Containers
- `Input`, `Textarea` - Form inputs
- `Label` - Form labels
- `Badge` - Tags, status indicators
- `Dialog`, `DialogContent` - Modals
- `DropdownMenu` - Context menus
- `Tabs` - Tab navigation
- `Toast`, `Toaster` - Notifications
- `ScrollArea` - Scrollable containers

#### New Components Needed
- `Avatar`, `AvatarImage`, `AvatarFallback` - User profile pictures
- `Breadcrumb`, `BreadcrumbItem`, `BreadcrumbSeparator` - Navigation
- `Progress` - Upload progress, password strength
- `Checkbox` - Form checkboxes
- `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `FormMessage` - Form handling (react-hook-form)

**Installation Command:**
```bash
npx shadcn@latest add avatar breadcrumb progress checkbox form
```

---

## Component File Structure

```
components/
├── auth/
│   ├── login-form.tsx
│   ├── signup-form.tsx
│   ├── password-strength-indicator.tsx
│   └── auth-guard.tsx (HOC for protected routes)
│
├── corpus/
│   ├── corpus-card.tsx
│   ├── corpus-grid.tsx
│   ├── corpus-list.tsx
│   ├── new-corpus-dialog.tsx
│   ├── edit-corpus-dialog.tsx
│   ├── delete-corpus-dialog.tsx
│   ├── corpus-document-list.tsx
│   ├── document-card.tsx
│   ├── corpus-breadcrumb.tsx
│   ├── corpus-selector.tsx (dropdown for switching)
│   └── upload-document-dialog.tsx
│
├── layout/
│   ├── app-header.tsx
│   ├── user-menu.tsx
│   ├── sidebar.tsx (future)
│   └── protected-layout.tsx
│
├── pdf-reader.tsx (existing, minor updates)
├── pdf-viewer.tsx (existing, no changes)
├── qa-interface.tsx (existing, corpus context integration)
│
└── ui/ (shadcn components)
    ├── avatar.tsx (new)
    ├── breadcrumb.tsx (new)
    ├── progress.tsx (new)
    ├── checkbox.tsx (new)
    ├── form.tsx (new)
    ├── button.tsx (existing)
    ├── card.tsx (existing)
    ├── input.tsx (existing)
    ├── dialog.tsx (existing)
    ├── dropdown-menu.tsx (existing)
    ├── badge.tsx (existing)
    └── ... (other existing components)
```

---

## Component Composition Patterns

### 1. Container/Presenter Pattern
```typescript
// Container (logic)
function CorpusPageContainer() {
  const { corpora, loading } = useCorpus()
  const [selectedCorpus, setSelectedCorpus] = useState(null)

  return (
    <CorpusPagePresenter
      corpora={corpora}
      loading={loading}
      onSelectCorpus={setSelectedCorpus}
    />
  )
}

// Presenter (UI only)
function CorpusPagePresenter({ corpora, loading, onSelectCorpus }) {
  return (
    <div>
      {loading ? <Skeleton /> : <CorpusGrid corpora={corpora} />}
    </div>
  )
}
```

### 2. Compound Components Pattern
```typescript
// Used for flexible component composition
<Dialog>
  <DialogTrigger asChild>
    <Button>New Corpus</Button>
  </DialogTrigger>
  <DialogContent>
    <DialogHeader>
      <DialogTitle>Create Corpus</DialogTitle>
    </DialogHeader>
    {/* Form content */}
  </DialogContent>
</Dialog>
```

### 3. Render Props Pattern
```typescript
// For flexible rendering based on state
<AuthGuard
  fallback={<LoginPage />}
  loading={<LoadingSpinner />}
>
  {(user) => <CorpusPage user={user} />}
</AuthGuard>
```

---

## Responsive Design Breakpoints

```typescript
const breakpoints = {
  sm: '640px',   // Mobile landscape
  md: '768px',   // Tablet
  lg: '1024px',  // Desktop
  xl: '1280px',  // Large desktop
  '2xl': '1536px' // Extra large
}

// Component adaptations:
// - CorpusGrid: 1 col (sm), 2 cols (md), 3 cols (lg), 4 cols (xl)
// - Header: Hamburger menu (<md), full nav (>=md)
// - PDFReader: Stack layout (<lg), side-by-side (>=lg)
```

---

## Accessibility (a11y) Requirements

### WCAG 2.1 Level AA Compliance

1. **Keyboard Navigation**
   - All interactive elements accessible via Tab
   - Focus indicators visible (outline, ring)
   - Skip links for main content

2. **Screen Reader Support**
   - Semantic HTML (nav, main, aside, article)
   - ARIA labels for icons/buttons
   - ARIA live regions for notifications
   - Alt text for images

3. **Color Contrast**
   - Text: 4.5:1 minimum ratio
   - Large text: 3:1 minimum
   - Interactive elements: 3:1 minimum

4. **Form Accessibility**
   - Labels associated with inputs
   - Error messages announced
   - Required fields indicated
   - Input validation feedback

5. **Component-Specific**
   ```typescript
   // Example: CorpusCard
   <Card
     role="article"
     aria-label={`Corpus: ${corpus.name}`}
     tabIndex={0}
     onKeyDown={(e) => e.key === 'Enter' && onOpen(corpus.id)}
   >
   ```

---

## Performance Optimization

### Code Splitting
```typescript
// Lazy load heavy components
const PDFReader = dynamic(() => import('@/components/pdf-reader'), {
  loading: () => <PDFReaderSkeleton />,
  ssr: false
})

const CorpusPage = dynamic(() => import('@/app/(app)/corpus/page'))
```

### Virtualization (for large lists)
```typescript
// Use react-window for 100+ documents
import { FixedSizeList } from 'react-window'

<FixedSizeList
  height={600}
  itemCount={documents.length}
  itemSize={100}
>
  {({ index, style }) => (
    <DocumentCard document={documents[index]} style={style} />
  )}
</FixedSizeList>
```

### Memoization
```typescript
// Prevent unnecessary re-renders
const CorpusCard = memo(({ corpus, onOpen }) => {
  return <Card>...</Card>
}, (prevProps, nextProps) => {
  return prevProps.corpus.id === nextProps.corpus.id &&
         prevProps.corpus.updated_at === nextProps.corpus.updated_at
})
```

---

## Testing Strategy

### Component Tests (Jest + React Testing Library)
```typescript
// Example: CorpusCard.test.tsx
describe('CorpusCard', () => {
  it('renders corpus information', () => {
    render(<CorpusCard corpus={mockCorpus} />)
    expect(screen.getByText(mockCorpus.name)).toBeInTheDocument()
  })

  it('calls onOpen when clicked', () => {
    const onOpen = jest.fn()
    render(<CorpusCard corpus={mockCorpus} onOpen={onOpen} />)
    fireEvent.click(screen.getByRole('button', { name: /open/i }))
    expect(onOpen).toHaveBeenCalledWith(mockCorpus.id)
  })
})
```

### Integration Tests (Cypress/Playwright)
- User login flow
- Corpus creation flow
- Document upload flow
- Corpus selection → PDF reader navigation

---

## Component Dependencies

```
AuthProvider (Context)
├── useAuth() hook
└── Components: LoginForm, SignupForm, UserMenu, AuthGuard

CorpusProvider (Context)
├── useCorpus() hook
└── Components: CorpusPage, CorpusCard, CorpusSelector, PDFReader

Existing Components (no changes)
├── PDFViewer
├── PDFUpload
├── AnnotationToolbar
├── CitationPopup
└── ImageGallery
```

---

**Document Version:** 1.0
**Last Updated:** 2025-11-08
**Status:** Ready for Implementation
