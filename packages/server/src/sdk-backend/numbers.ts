import { purchaseResult } from './response.js';
import { type default as Mobilerun } from '@mobilerun/sdk';
import { type NumbersBackend } from '@mobilerun/mcp-tools';

export function createNumbersBackend(client: Mobilerun): NumbersBackend {
    return {
        async numbersCountries() {
            return client.numbers.countries();
        },
        async numbersCapacity(params) {
            return client.numbers.capacity({ country: params.country });
        },
        async numbersList(params) {
            return client.numbers.list({ page: params.page, pageSize: params.pageSize });
        },
        async numbersGet(params) {
            return client.numbers.retrieve(params.numberId);
        },
        async numbersCreate(params) {
            return purchaseResult(client.numbers.create(
                { country: params.country, label: params.label, billingPreference: params.billingPreference },
            ));
        },
        async numbersUpdate(params) {
            return client.numbers.update(params.numberId, { label: params.label });
        },
        async numbersDelete(params) {
            return client.numbers.delete(params.numberId);
        },
        async numbersMessages(params) {
            return client.numbers.messages.list(params.numberId, {
                direction: params.direction,
                page: params.page,
                pageSize: params.pageSize,
                since: params.since,
            });
        },
        async numbersSend(params) {
            return client.numbers.messages.send(params.numberId, {
                body: params.body,
                to: params.to,
                deliveryReport: params.deliveryReport,
            });
        },
    };
}
