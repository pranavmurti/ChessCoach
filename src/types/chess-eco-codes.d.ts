declare module "chess-eco-codes" {
  export type OpeningInfo = {
    eco: string;
    name: string;
    moves: string;
  };

  const lookup: (fen: string) => OpeningInfo | undefined;
  export default lookup;
}

