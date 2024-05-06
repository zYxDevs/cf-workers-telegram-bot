import TelegramBot from '../telegram_bot';
import { TelegramUpdate, TelegramInlineQueryResultArticle } from '../types';

export default async (self: TelegramBot, update: TelegramUpdate, args: string[]): Promise<Response> => {
	if (self.ai === undefined) {
		return new Response('ok');
	}
	let _prompt: string;
	if (args[0][0] === '/') {
		_prompt = args.slice(1).join(' ');
	} else {
		_prompt = args.join(' ');
	}
	if (_prompt === '') {
		_prompt = '';
	}
	const results = await (async () => {
		if (self.db) {
			const { results } = await self.db
				.prepare('SELECT * FROM Messages WHERE userId=?')
				.bind(update.inline_query ? update.inline_query.from.id : update.message?.from.id)
				.all();
			return results;
		}
	})();
	const old_messages: { role: string; content: string }[] = (() => {
		if (results) {
			return results.map((col) => ({
				role: 'system',
				content: col.content as string,
			}));
		}
		return [];
	})();
	const system_prompt =
		'<s>' +
		[
			`Your name is ${self.bot_name}.`,
			`You are talking to ${update.message?.from.first_name}.`,
			`Your source code is at https://github.com/codebam/cf-workers-telegram-bot .`,
			`the current date is ${new Date().toString()}`,
			'Sean Behan is a full stack developer who goes by the username codebam.',
			'Sean Behan likes programming and video games.',
			"Pretend to be Sean Behan but don't make things up.",
		].reduce((acc, cur) => {
			return acc + cur + '\n';
		}) +
		old_messages.reduce((acc, cur) => {
			return acc + cur.content + '\n';
		}, '') +
		'</s>';
	const p = system_prompt + '[INST]' + _prompt + '[/INST]';
	const prompt = p.slice(p.length - 4096, p.length);
	const response = await self.ai
		// @ts-expect-error model might not match
		.run(self.chat_model, {
			prompt,
			max_tokens: 596,
		})
		/* eslint-disable  @typescript-eslint/no-explicit-any */
		.then(({ response }: any) =>
			response
				.replace(/(\[|)(\/|)INST(S|)(s|)(\]|)/, '')
				.replace(/<<(\/|)SYS>>/, '')
				.replace(/[OUT]/, ''),
		);
	if (self.db) {
		const { success } = await self.db
			.prepare('INSERT INTO Messages (id, userId, content) VALUES (?, ?, ?)')
			.bind(
				crypto.randomUUID(),
				update.inline_query ? update.inline_query.from.id : update.message?.from.id,
				'[INST] ' + _prompt + ' [/INST]' + '\n' + response,
			)
			.run();
		if (!success) {
			console.log('failed to insert data into d1');
		}
	}
	if (update.inline_query) {
		return self.answerInlineQuery(update.inline_query.id, [new TelegramInlineQueryResultArticle(response)]);
	}
	return self.sendMessage(update.message?.chat.id ?? 0, response, '', false, false, update.message?.message_id);
};
