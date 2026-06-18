#!/bin/sh

set -u

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
cd "$ROOT_DIR" || exit 1

pause() {
    printf '\nPress Enter to continue... '
    read -r _
}

print_header() {
    clear
    printf 'LABY project helper\n'
    printf '===================\n'
    printf 'Folder: %s\n\n' "$ROOT_DIR"
}

check_js() {
    if ! command -v node >/dev/null 2>&1; then
        printf 'ERROR: node is not installed or not in PATH.\n'
        return 1
    fi

    printf 'Checking JavaScript syntax...\n\n'
    node --check game.js || {
        printf '\nJavaScript check failed.\n'
        return 1
    }

    printf '\nJavaScript syntax OK.\n'
    return 0
}

check_svg() {
    if command -v xmllint >/dev/null 2>&1; then
        printf 'Checking SVG XML syntax...\n\n'
        find assets/sprites -name '*.svg' -print | while IFS= read -r file; do
            xmllint --noout "$file" || exit 1
        done || {
            printf '\nSVG XML check failed.\n'
            return 1
        }
    else
        printf 'SVG XML syntax skipped: xmllint not found.\n'
        return 0
    fi

    printf '\nSVG XML syntax OK.\n'
    return 0
}

run_checks() {
    printf 'Running all checks...\n\n'
    check_js || return 1
    printf '\n'
    check_svg || return 1
    printf '\nAll checks passed.\n'
    return 0
}

run_direct_command() {
    case "$1" in
        1|js|check-js)
            check_js
            ;;
        2|svg|check-svg)
            check_svg
            ;;
        3|check|checks|all)
            run_checks
            ;;
        4|status)
            show_status
            ;;
        5|server)
            start_server
            ;;
        6|sprites)
            printf 'Editable sprites:\n\n'
            find assets/sprites -maxdepth 1 -type f -name '*.svg' | sort
            ;;
        7|branches)
            printf 'Current branch: %s\n\n' "$(git branch --show-current)"
            printf 'Local branches:\n\n'
            git branch --sort=-committerdate
            printf '\nRecent commits:\n\n'
            git log --oneline --decorate --graph --all -n 12
            ;;
        8|wasm)
            build_wasm
            ;;
        help|-h|--help)
            printf 'Usage: ./laby.sh [command]\n\n'
            printf 'Commands:\n'
            printf '  1, js          Check JavaScript syntax\n'
            printf '  2, svg         Check SVG XML syntax\n'
            printf '  3, check       Run all checks\n'
            printf '  4, status      Show git status\n'
            printf '  5, server      Start local server\n'
            printf '  6, sprites     List editable sprites\n'
            printf '  7, branches    Show branches and recent commits\n'
            printf '  8, wasm        Rebuild wasm core (wasm/src/lib.rs -> assets/wasm)\n'
            printf '\nWithout command, interactive menu is shown.\n'
            ;;
        *)
            printf 'Unknown command: %s\n\n' "$1"
            printf 'Run ./laby.sh help for available commands.\n'
            return 1
            ;;
    esac
}

show_status() {
    printf 'Git status:\n\n'
    printf 'Current branch: %s\n\n' "$(git branch --show-current)"
    git status --short
    if [ -z "$(git status --short)" ]; then
        printf 'Working tree is clean.\n'
    fi
}

show_branches() {
    print_header
    printf 'Current branch: %s\n\n' "$(git branch --show-current)"
    printf 'Local branches:\n\n'
    git branch --sort=-committerdate
    printf '\nRecent commits:\n\n'
    git log --oneline --decorate --graph --all -n 12
    pause
}

create_branch() {
    print_header

    if [ -n "$(git status --short)" ]; then
        printf 'Local changes exist. Commit or discard them before creating a branch.\n\n'
        show_status
        pause
        return
    fi

    printf 'New branch name: '
    read -r branch
    if [ -z "$branch" ]; then
        printf 'Branch creation aborted: empty name.\n'
        pause
        return
    fi

    case "$branch" in
        *[!A-Za-z0-9._/-]*)
            printf 'Branch creation aborted: use only letters, digits, dot, underscore, slash, hyphen.\n'
            pause
            return
            ;;
    esac

    git rev-parse --verify "$branch" >/dev/null 2>&1 && {
        printf 'Branch already exists: %s\n' "$branch"
        pause
        return
    }

    printf '\nCreating and switching to %s...\n' "$branch"
    git switch -c "$branch" || {
        printf 'ERROR: branch creation failed.\n'
        pause
        return
    }

    printf '\nDone. Current branch: %s\n' "$(git branch --show-current)"
    pause
}

switch_to_main() {
    print_header

    if [ -n "$(git status --short)" ]; then
        printf 'Local changes exist. Commit or discard them before switching branches.\n\n'
        show_status
        pause
        return
    fi

    printf 'Switching to main...\n\n'
    git switch main || {
        printf 'ERROR: git switch main failed.\n'
        pause
        return
    }

    printf 'Current branch: %s\n' "$(git branch --show-current)"
    pause
}

commit_and_push() {
    print_header
    run_checks || {
        printf '\nCommit aborted because checks failed.\n'
        pause
        return
    }

    printf '\n'
    show_status

    if [ -z "$(git status --short)" ]; then
        printf '\nNothing to commit.\n'
        pause
        return
    fi

    printf '\nCommit message: '
    read -r message
    if [ -z "$message" ]; then
        printf 'Commit aborted: empty message.\n'
        pause
        return
    fi

    printf '\nStaging all changes...\n'
    git add -A || {
        printf 'ERROR: git add failed.\n'
        pause
        return
    }

    printf '\nCreating commit...\n'
    git commit -m "$message" || {
        printf 'ERROR: git commit failed.\n'
        pause
        return
    }

    printf '\nPushing to GitHub...\n'
    git push origin "$(git branch --show-current)" || {
        printf 'ERROR: git push failed.\n'
        pause
        return
    }

    printf '\nDone.\n'
    pause
}

pull_from_github() {
    print_header

    if [ -n "$(git status --short)" ]; then
        printf 'Local changes exist. Commit or discard them before pulling.\n\n'
        show_status
        pause
        return
    fi

    branch=$(git branch --show-current)
    printf 'Pulling origin/%s with --ff-only...\n\n' "$branch"
    git pull --ff-only origin "$branch" || {
        printf '\nERROR: pull failed. You may need to resolve divergence manually.\n'
        pause
        return
    }

    printf '\nDone.\n'
    pause
}

start_server() {
    print_header
    port=8081
    printf 'Starting local server on http://127.0.0.1:%s\n' "$port"
    printf 'Stop it with Ctrl+C.\n\n'
    python3 -m http.server "$port"
}

list_sprites() {
    print_header
    printf 'Editable sprites:\n\n'
    find assets/sprites -maxdepth 1 -type f -name '*.svg' | sort
    pause
}

build_wasm() {
    print_header
    if ! command -v wasm-pack >/dev/null 2>&1; then
        printf 'ERROR: wasm-pack is not installed.\n'
        printf 'Install with: cargo install wasm-pack\n'
        pause
        return 1
    fi

    printf 'Building wasm core from wasm/src/lib.rs...\n\n'
    (cd wasm && wasm-pack build --target no-modules --release) || {
        printf '\nwasm build failed.\n'
        pause
        return 1
    }

    printf '\nCopying artifacts to assets/wasm/...\n'
    mkdir -p assets/wasm
    cp wasm/pkg/laby_core_bg.wasm assets/wasm/ || {
        printf 'ERROR: copy of .wasm failed.\n'
        pause
        return 1
    }
    cp wasm/pkg/laby_core.js assets/wasm/ || {
        printf 'ERROR: copy of laby_core.js failed.\n'
        pause
        return 1
    }

    printf '\nwasm core rebuilt and copied to assets/wasm/.\n'
    ls -lh assets/wasm/laby_core_bg.wasm
    pause
}

if [ "$#" -gt 0 ]; then
    run_direct_command "$1"
    exit $?
fi

while :; do
    print_header
    printf '1) Check JavaScript syntax\n'
    printf '2) Check SVG XML syntax\n'
    printf '3) Run all checks\n'
    printf '4) Commit and push to GitHub\n'
    printf '5) Pull latest from GitHub\n'
    printf '6) Show git status\n'
    printf '7) Start local server\n'
    printf '8) List editable sprites\n'
    printf '9) Show branches and recent commits\n'
    printf '10) Create and switch to new branch\n'
    printf '11) Switch to main\n'
    printf '12) Rebuild wasm core\n'
    printf '0) Exit\n'
    printf '\nChoose: '
    read -r choice

    case "$choice" in
        1)
            print_header
            check_js
            pause
            ;;
        2)
            print_header
            check_svg
            pause
            ;;
        3)
            print_header
            run_checks
            pause
            ;;
        4)
            commit_and_push
            ;;
        5)
            pull_from_github
            ;;
        6)
            print_header
            show_status
            pause
            ;;
        7)
            start_server
            ;;
        8)
            list_sprites
            ;;
        9)
            show_branches
            ;;
        10)
            create_branch
            ;;
        11)
            switch_to_main
            ;;
        12)
            build_wasm
            ;;
        0)
            exit 0
            ;;
        *)
            printf 'Unknown option.\n'
            pause
            ;;
    esac
done
