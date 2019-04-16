/********************************************************************************
 * Copyright (C) 2017 TypeFox and others.
 *
 * This program and the accompanying materials are made available under the
 * terms of the Eclipse Public License v. 2.0 which is available at
 * http://www.eclipse.org/legal/epl-2.0.
 *
 * This Source Code may also be made available under the following Secondary
 * Licenses when the conditions for such availability set forth in the Eclipse
 * Public License v. 2.0 are satisfied: GNU General Public License, version 2
 * with the GNU Classpath Exception which is available at
 * https://www.gnu.org/software/classpath/license.html.
 *
 * SPDX-License-Identifier: EPL-2.0 OR GPL-2.0 WITH Classpath-exception-2.0
 ********************************************************************************/

import { inject, injectable } from 'inversify';
import { Command, CommandRegistry } from '../../common';
import { Keybinding, KeybindingRegistry } from '../keybinding';
import { QuickOpenModel, QuickOpenItem, QuickOpenMode, QuickOpenGroupItem, QuickOpenGroupItemOptions } from './quick-open-model';
import { QuickOpenOptions } from './quick-open-service';
import { QuickOpenContribution, QuickOpenHandlerRegistry, QuickOpenHandler } from './prefix-quick-open-service';
import { ContextKeyService } from '../context-key-service';

@injectable()
export class QuickCommandService implements QuickOpenModel, QuickOpenHandler {

    private items: QuickOpenItem[];

    readonly prefix: string = '>';

    readonly description: string = 'Quick Command';

    @inject(CommandRegistry)
    protected readonly commands: CommandRegistry;

    @inject(KeybindingRegistry)
    protected readonly keybindings: KeybindingRegistry;

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    protected readonly contexts = new Map<string, string[]>();
    pushCommandContext(commandId: string, when: string) {
        const contexts = this.contexts.get(commandId) || [];
        contexts.push(when);
        this.contexts.set(commandId, contexts);
    }

    /** Initialize this quick open model with the commands. */
    init(): void {
        // let's compute the items here to do it in the context of the currently activeElement
        this.items = [];
        const recentCommands: Command[] = this.commands.recent;
        const allCommands: Command[] = this.commands.commands;
        const { recent, all } = this.getCommands(recentCommands, allCommands);
        const filteredAndSortedCommands = this.getValidCommands(all)
            .filter(a => a.label)
            .sort((a, b) => Command.compareCommands(a, b));
        this.items.push(
            ...recent.map((command, index) =>
                new CommandQuickOpenItem(
                    command,
                    this.commands,
                    this.keybindings,
                    {
                        groupLabel: index === 0 ? 'recently used' : '',
                        showBorder: false
                    })),
            ...filteredAndSortedCommands.map((command, index) =>
                new CommandQuickOpenItem(
                    command,
                    this.commands,
                    this.keybindings,
                    {
                        groupLabel: recent.length <= 0 ? '' : index === 0 ? 'other commands' : '',
                        showBorder: recent.length <= 0 ? false : index === 0 ? true : false
                    })),
        );
    }

    public onType(lookFor: string, acceptor: (items: QuickOpenItem[]) => void): void {
        acceptor(this.items);
    }

    getModel(): QuickOpenModel {
        return this;
    }

    getOptions(): QuickOpenOptions {
        return { fuzzyMatchLabel: true };
    }

    /**
     * Get the list of recently used commands, and all commands.
     *
     * @param recentCommands recently used commands.
     * @param allCommands all available commands.
     */
    private getCommands(recentCommands: Command[], allCommands: Command[]): { recent: Command[], all: Command[] } {

        // Add recently used items to the list.
        const recent: Command[] = [];
        recentCommands.forEach((r: Command) => {
            const exist = [...allCommands].some((c: Command) => Command.equals(c, r));
            if (exist) {
                recent.push(r);
            }
        });

        // Add all commands, which are currently not recently used.
        const all: Command[] = [];
        allCommands.forEach((a: Command) => {
            const exist = [...recentCommands].some((c: Command) => Command.equals(c, a));
            if (!exist) {
                all.push(a);
            }
        });

        return { recent, all };
    }

    /**
     * Get the list of valid commands.
     *
     * @param commands the raw list of commands.
     */
    getValidCommands(commands: Command[]): Command[] {
        const valid: Command[] = [];
        commands.forEach((command: Command) => {
            if (command.label) {
                const contexts = this.contexts.get(command.id);
                if (!contexts || contexts.some(when => this.contextKeyService.match(when))) {
                    valid.push(command);
                }
            }
        });
        return valid;
    }

}

export class CommandQuickOpenItem extends QuickOpenGroupItem {

    private activeElement: HTMLElement;
    private hidden: boolean;

    constructor(
        protected readonly command: Command,
        protected readonly commands: CommandRegistry,
        protected readonly keybindings: KeybindingRegistry,
        protected readonly options: QuickOpenGroupItemOptions
    ) {
        super(options);
        this.activeElement = window.document.activeElement as HTMLElement;
        this.hidden = !this.commands.getActiveHandler(this.command.id);
    }

    getLabel(): string {
        return (this.command.category)
            ? `${this.command.category}: ` + this.command.label!
            : this.command.label!;
    }

    isHidden(): boolean {
        return this.hidden;
    }

    getIconClass() {
        const toggleHandler = this.commands.getToggledHandler(this.command.id);
        if (toggleHandler && toggleHandler.isToggled && toggleHandler.isToggled()) {
            return 'fa fa-check';
        }
        return super.getIconClass();
    }

    getKeybinding(): Keybinding | undefined {
        const bindings = this.keybindings.getKeybindingsForCommand(this.command.id);
        return bindings ? bindings[0] : undefined;
    }

    run(mode: QuickOpenMode): boolean {
        if (mode !== QuickOpenMode.OPEN) {
            return false;
        }
        // allow the quick open widget to close itself
        setTimeout(() => {
            // reset focus on the previously active element.
            this.activeElement.focus();
            this.commands.executeCommand(this.command.id);
        }, 50);
        return true;
    }
}

@injectable()
export class CommandQuickOpenContribution implements QuickOpenContribution {

    @inject(QuickCommandService)
    protected readonly commandQuickOpenHandler: QuickCommandService;

    registerQuickOpenHandlers(handlers: QuickOpenHandlerRegistry): void {
        handlers.registerHandler(this.commandQuickOpenHandler);
    }
}
